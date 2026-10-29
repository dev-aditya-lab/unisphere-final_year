"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireProfile } from "@/lib/auth/session";
import { fail, ok, parseInput } from "@/lib/actions/result";
import { enforceRateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { academyRpc, rpcFailure } from "@/lib/services/academy";
import { processRefund, reconcileOrder } from "@/lib/services/academy-commerce";
import { bulkIssue, createTemplateVersion, issueCertificate, previewTemplate } from "@/lib/services/academy-certificates";
import { toMinor } from "@/lib/academy/money";
import * as v from "@/lib/validators/academy";

/**
 * Academy staff actions. Each one validates the form, then writes through the staff member's own session: Row Level Security, the
 * guard triggers and the database functions decide whether this person may do it (prices need pricing access, publishing needs
 * publish access, certificates need certificate access...). The checks here only give friendlier messages and rate limits.
 */

// Tables an administrator edits through the generic save/delete actions, with the rules for each.
const ENTITIES = {
  category: { table: "academy_categories", schema: v.categorySchema, paths: ["/admin/academy/courses", "/academy/courses"], deletable: true },
  course: { table: "academy_courses", schema: v.courseSchema, row: v.courseRow, paths: ["/admin/academy/courses", "/academy/courses", "/academy/programs", "/academy/internships", "/academy"] },
  module: { table: "academy_modules", schema: v.moduleSchema, paths: ["/admin/academy/courses"], deletable: true, order: "course_id" },
  lesson: { table: "academy_lessons", schema: v.lessonSchema, paths: ["/admin/academy/courses"], deletable: true, order: "module_id" },
  cohort: { table: "academy_cohorts", schema: v.cohortSchema, paths: ["/admin/academy/courses"], deletable: true },
  price_rule: { table: "academy_price_rules", schema: v.priceRuleSchema, paths: ["/admin/academy/pricing", "/admin/academy/courses", "/academy/courses", "/academy/pricing"], deletable: true, stamp: true },
  live_session: { table: "academy_live_sessions", schema: v.liveSessionSchema, paths: ["/admin/academy/live", "/academy/dashboard"], deletable: true },
  assignment: { table: "academy_assignments", schema: v.assignmentSchema, paths: ["/admin/academy/assignments", "/admin/academy/courses"], deletable: true, stamp: true },
};

const refresh = (paths) => {
  for (const p of paths) revalidatePath(p, "layout");
};

async function staffGate(scope, limit = 240) {
  const { user } = await requireProfile();
  const limited = await enforceRateLimit(`academy-admin-${scope}`, user.id, { limit, windowSec: 3600 });
  return { user, limited };
}

/** Create (no id) or update (with id) one row of a whitelisted table. */
export async function saveEntityAction(entity, rowId, input) {
  const cfg = ENTITIES[entity];
  if (!cfg) return fail("Unknown record type.", { code: "invalid" });
  const { user, limited } = await staffGate("save");
  if (limited) return limited;
  if (rowId && !z.uuid().safeParse(rowId).success) return fail("That record was not found.", { code: "not_found" });
  const { data, failure } = parseInput(cfg.schema, input);
  if (failure) return failure;
  const row = { ...(cfg.row ? cfg.row(data) : data), ...(cfg.stamp && !rowId ? { created_by: user.id } : {}) };
  const supabase = await createClient();
  const res = rowId
    ? await supabase.from(cfg.table).update(row).eq("id", rowId).select("id").maybeSingle()
    : await supabase.from(cfg.table).insert(row).select("id").single();
  if (res.error) return rpcFailure(res.error);
  if (!res.data) return fail("You do not have permission to change that, or it no longer exists.", { code: "forbidden" });
  refresh(cfg.paths);
  return ok({ id: res.data.id, message: rowId ? "Saved." : "Created." });
}

export async function deleteEntityAction(entity, rowId) {
  const cfg = ENTITIES[entity];
  if (!cfg?.deletable || !z.uuid().safeParse(rowId).success) return fail("That cannot be deleted.", { code: "invalid" });
  const { limited } = await staffGate("delete", 120);
  if (limited) return limited;
  const { data, error } = await (await createClient()).from(cfg.table).delete().eq("id", rowId).select("id");
  if (error) return rpcFailure(error);
  if (!data?.length) return fail("You do not have permission to delete that, or it no longer exists.", { code: "forbidden" });
  refresh(cfg.paths);
  return ok({ message: "Deleted." });
}

/** Move a module or lesson up or down among its neighbours. */
export async function moveEntityAction(entity, rowId, direction) {
  const cfg = ENTITIES[entity];
  if (!cfg?.order || !z.uuid().safeParse(rowId).success || !["up", "down"].includes(direction)) return fail("That cannot be moved.", { code: "invalid" });
  const { limited } = await staffGate("move");
  if (limited) return limited;
  const supabase = await createClient();
  const { data: me } = await supabase.from(cfg.table).select(`id, position, ${cfg.order}`).eq("id", rowId).maybeSingle();
  if (!me) return fail("That no longer exists.", { code: "not_found" });
  const { data: siblings } = await supabase.from(cfg.table).select("id, position").eq(cfg.order, me[cfg.order]).order("position").order("id");
  const list = siblings ?? [];
  const i = list.findIndex((s) => s.id === rowId);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= list.length) return ok({});
  // Renumber 0..n so positions never tie, then swap the pair.
  [list[i], list[j]] = [list[j], list[i]];
  for (const [pos, s] of list.entries()) {
    if (s.position !== pos) {
      const { error } = await supabase.from(cfg.table).update({ position: pos }).eq("id", s.id);
      if (error) return rpcFailure(error);
    }
  }
  refresh(cfg.paths);
  return ok({});
}

// ── Courses ────────────────────────────────────────────────────────────────
export async function setCoursePricingAction(courseId, input) {
  const { limited } = await staffGate("pricing", 120);
  if (limited) return limited;
  const { data, failure } = parseInput(v.coursePricingSchema, input);
  if (failure) return failure;
  const res = await (await createClient()).from("academy_courses").update({ price_minor: data.price, refund_days: data.refund_days }).eq("id", courseId).select("id").maybeSingle();
  if (res.error) return rpcFailure(res.error);
  if (!res.data) return fail("You do not have permission to change prices.", { code: "forbidden" });
  refresh(["/admin/academy/courses", "/admin/academy/pricing", "/academy/courses", "/academy/pricing", "/academy"]);
  return ok({ message: "Price saved. New purchases use it; existing orders keep the price they were bought at." });
}

export async function setCourseStatusAction(courseId, status) {
  if (!z.uuid().safeParse(courseId).success || !["draft", "published", "unpublished", "archived"].includes(status)) return fail("That is not a valid status.", { code: "invalid" });
  const { limited } = await staffGate("status", 120);
  if (limited) return limited;
  const res = await (await createClient()).from("academy_courses").update({ status }).eq("id", courseId).select("id").maybeSingle();
  if (res.error) return rpcFailure(res.error);
  if (!res.data) return fail("You do not have permission to do that.", { code: "forbidden" });
  refresh(["/admin/academy/courses", "/academy/courses", "/academy/programs", "/academy/internships", "/academy", "/academy/pricing"]);
  return ok({ message: { published: "Published. It is now visible to everyone.", unpublished: "Unpublished. People already enrolled keep their access.", archived: "Archived. People already enrolled keep their access.", draft: "Moved back to draft." }[status] });
}

export async function setCourseCoverAction(courseId, fileKey) {
  const { limited } = await staffGate("cover", 60);
  if (limited) return limited;
  if (fileKey !== null && !/^academy_cover\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(png|jpg|webp)$/.test(String(fileKey))) return fail("That image could not be used.", { code: "invalid_image" });
  const res = await (await createClient()).from("academy_courses").update({ cover_key: fileKey }).eq("id", courseId).select("id").maybeSingle();
  if (res.error) return rpcFailure(res.error);
  if (!res.data) return fail("You do not have permission to do that.", { code: "forbidden" });
  refresh(["/admin/academy/courses", "/academy/courses", "/academy"]);
  return ok({ message: "Cover image updated." });
}

export async function saveLessonContentAction(input) {
  const { limited } = await staffGate("content");
  if (limited) return limited;
  const { data, failure } = parseInput(v.lessonContentSchema, input);
  if (failure) return failure;
  const { error } = await (await createClient()).from("academy_lesson_content").upsert(data, { onConflict: "lesson_id" });
  if (error) return rpcFailure(error);
  refresh(["/admin/academy/courses", "/academy/learn"]);
  return ok({ message: "Lesson saved." });
}

export async function addResourceAction(input) {
  const { limited } = await staffGate("resource", 60);
  if (limited) return limited;
  const { data, failure } = parseInput(z.object({ course_id: v.id, lesson_id: z.union([z.literal(""), z.null(), z.undefined(), v.id]).transform((x) => x || null), title: z.string().trim().min(2).max(120), file_id: v.id }), input);
  if (failure) return failure;
  const { error } = await (await createClient()).from("academy_resources").insert(data);
  if (error) return rpcFailure(error);
  refresh(["/admin/academy/courses"]);
  return ok({ message: "Resource added." });
}

export async function deleteResourceAction(resourceId) {
  const { limited } = await staffGate("resource", 60);
  if (limited) return limited;
  const { data, error } = await (await createClient()).from("academy_resources").delete().eq("id", resourceId).select("id");
  if (error) return rpcFailure(error);
  if (!data?.length) return fail("You do not have permission to do that.", { code: "forbidden" });
  refresh(["/admin/academy/courses"]);
  return ok({ message: "Removed." });
}

export async function saveQuizQuestionAction(questionId, input) {
  const { limited } = await staffGate("quiz");
  if (limited) return limited;
  const { data, failure } = parseInput(v.quizQuestionSchema, input);
  if (failure) return failure;
  const supabase = await createClient();
  const { correct, ...q } = data;
  const res = questionId
    ? await supabase.from("academy_quiz_questions").update(q).eq("id", questionId).select("id").maybeSingle()
    : await supabase.from("academy_quiz_questions").insert(q).select("id").single();
  if (res.error) return rpcFailure(res.error);
  if (!res.data) return fail("You do not have permission to do that.", { code: "forbidden" });
  const key = await supabase.from("academy_quiz_keys").upsert({ question_id: res.data.id, correct }, { onConflict: "question_id" });
  if (key.error) return rpcFailure(key.error);
  refresh(["/admin/academy/courses"]);
  return ok({ id: res.data.id, message: "Question saved." });
}

export async function deleteQuizQuestionAction(questionId) {
  const { limited } = await staffGate("quiz");
  if (limited) return limited;
  const { data, error } = await (await createClient()).from("academy_quiz_questions").delete().eq("id", questionId).select("id");
  if (error) return rpcFailure(error);
  if (!data?.length) return fail("You do not have permission to do that.", { code: "forbidden" });
  refresh(["/admin/academy/courses"]);
  return ok({ message: "Question deleted." });
}

// ── Mentors ────────────────────────────────────────────────────────────────
async function findUser(username) {
  const { data } = await (await createClient()).rpc("academy_find_user", { p_username: username });
  return data?.[0] ?? null;
}

export async function saveMentorAction(input) {
  const { limited } = await staffGate("mentor", 60);
  if (limited) return limited;
  const { data, failure } = parseInput(v.mentorSchema, input);
  if (failure) return failure;
  const target = await findUser(data.username);
  if (!target) return fail("No active member with that exact username.", { code: "not_found", fieldErrors: { username: "No such member." } });
  const { error } = await (await createClient()).from("academy_mentors").upsert({ user_id: target.id, display_name: data.display_name, headline: data.headline, bio: data.bio, active: data.active }, { onConflict: "user_id" });
  if (error) return rpcFailure(error);
  refresh(["/admin/academy/mentors", "/academy/mentorship"]);
  return ok({ message: `${data.display_name} is a mentor. Give them the Mentor role in Admin > Staff & roles so they can grade work.` });
}

export async function assignMentorAction(input) {
  const { limited } = await staffGate("mentor", 120);
  if (limited) return limited;
  const { data, failure } = parseInput(v.courseMentorSchema, input);
  if (failure) return failure;
  const { error } = await (await createClient()).from("academy_course_mentors").upsert(data, { onConflict: "course_id,user_id" });
  if (error) return rpcFailure(error);
  refresh(["/admin/academy/courses", "/admin/academy/mentors", "/academy/courses"]);
  return ok({ message: "Mentor assigned." });
}

export async function unassignMentorAction(courseId, userId) {
  const { limited } = await staffGate("mentor", 120);
  if (limited) return limited;
  const { data, error } = await (await createClient()).from("academy_course_mentors").delete().eq("course_id", courseId).eq("user_id", userId).select("user_id");
  if (error) return rpcFailure(error);
  if (!data?.length) return fail("You do not have permission to do that.", { code: "forbidden" });
  refresh(["/admin/academy/courses", "/admin/academy/mentors", "/academy/courses"]);
  return ok({ message: "Removed." });
}

// ── Coupons ────────────────────────────────────────────────────────────────
export async function saveCouponAction(couponId, input) {
  const { limited } = await staffGate("coupon", 120);
  if (limited) return limited;
  const { data, failure } = parseInput(v.couponSchema, input);
  if (failure) return failure;
  const supabase = await createClient();
  const people = [];
  for (const username of data.usernames) {
    const u = await findUser(username);
    if (!u) return fail(`No active member with the username "${username}".`, { code: "not_found", fieldErrors: { usernames: `No such member: ${username}` } });
    people.push(u.id);
  }
  const res = couponId
    ? await supabase.from("academy_coupons").update(data.couponRow).eq("id", couponId).select("id").maybeSingle()
    : await supabase.from("academy_coupons").insert(data.couponRow).select("id").single();
  if (res.error) return res.error.code === "23505" ? fail("A coupon with that code already exists.", { code: "duplicate", fieldErrors: { code: "Already used." } }) : rpcFailure(res.error);
  if (!res.data) return fail("You do not have permission to do that.", { code: "forbidden" });
  const cid = res.data.id;
  // The restriction lists are replaced as a whole.
  for (const [table, col, ids] of [["academy_coupon_courses", "course_id", data.courseIds], ["academy_coupon_categories", "category_id", data.categoryIds], ["academy_coupon_users", "user_id", people]]) {
    const del = await supabase.from(table).delete().eq("coupon_id", cid);
    if (del.error) return rpcFailure(del.error);
    if (ids.length) {
      const ins = await supabase.from(table).insert(ids.map((x) => ({ coupon_id: cid, [col]: x })));
      if (ins.error) return rpcFailure(ins.error);
    }
  }
  refresh(["/admin/academy/coupons"]);
  return ok({ id: cid, message: couponId ? "Coupon saved." : "Coupon created." });
}

/** The pricing preview: what a course costs, with or without a coupon, as of now or a later date, without creating anything. */
export async function adminQuoteAction(input) {
  const { limited } = await staffGate("quote", 300);
  if (limited) return limited;
  const { data, failure } = parseInput(z.object({ courseId: v.id, cohortId: z.union([z.literal(""), z.null(), z.undefined(), v.id]).transform((x) => x || null), coupon: z.string().trim().max(40).optional().nullable().transform((x) => x || null), at: z.string().optional().nullable().transform((x) => (x ? new Date(x).toISOString() : null)), username: z.string().trim().toLowerCase().optional().nullable() }), input);
  if (failure) return failure;
  let userId = null;
  if (data.username) {
    const u = await findUser(data.username);
    if (!u) return fail("No active member with that username.", { code: "not_found" });
    userId = u.id;
  }
  const { data: q, error } = await (await createClient()).rpc("academy_admin_quote", { p_course: data.courseId, p_cohort: data.cohortId, p_coupon: data.coupon, p_user: userId, p_at: data.at });
  if (error) return rpcFailure(error);
  return ok({ quote: q });
}

// ── Students, orders, refunds ──────────────────────────────────────────────
export async function enrollStudentAction(input) {
  const { limited } = await staffGate("enroll", 120);
  if (limited) return limited;
  const { data, failure } = parseInput(z.object({ username: z.string().trim().toLowerCase().regex(/^[a-z0-9_-]{3,30}$/, "Enter an exact username."), courseId: v.id, cohortId: z.union([z.literal(""), z.null(), z.undefined(), v.id]).transform((x) => x || null), source: z.enum(["complimentary", "scholarship"]), reason: z.string().trim().min(3, "Give a reason (at least 3 characters).").max(300), days: z.union([z.literal(""), z.null(), z.undefined(), z.coerce.number().int().min(1).max(3650)]).transform((x) => (x === "" || x == null ? null : Number(x))) }), input);
  if (failure) return failure;
  const target = await findUser(data.username);
  if (!target) return fail("No active member with that exact username.", { code: "not_found", fieldErrors: { username: "No such member." } });
  const res = await academyRpc("academy_admin_enroll", { p_user: target.id, p_course: data.courseId, p_cohort: data.cohortId, p_source: data.source, p_reason: data.reason, p_access_days: data.days });
  if (res.ok) {
    refresh(["/admin/academy/students", "/admin/academy/students"]);
    return ok({ message: res.data?.created ? `${target.full_name} is now enrolled and has been told.` : `${target.full_name} was already enrolled.` });
  }
  return res;
}

export async function setEnrollmentAction(input) {
  const { limited } = await staffGate("enroll", 120);
  if (limited) return limited;
  const { data, failure } = parseInput(z.object({ enrollmentId: v.id, action: z.enum(["suspend", "restore", "revoke", "extend"]), reason: z.string().trim().min(3, "Give a reason (at least 3 characters).").max(300), days: z.union([z.literal(""), z.null(), z.undefined(), z.coerce.number().int().min(1).max(3650)]).transform((x) => (x === "" || x == null ? null : Number(x))) }), input);
  if (failure) return failure;
  const res = await academyRpc("academy_admin_set_enrollment", { p_enrollment: data.enrollmentId, p_action: data.action, p_reason: data.reason, p_days: data.days });
  if (res.ok) refresh(["/admin/academy/students", "/admin/academy/students"]);
  return res.ok ? ok({ message: "Done." }) : res;
}

export async function reviewRefundAction(input) {
  const { limited } = await staffGate("refund", 120);
  if (limited) return limited;
  const { data, failure } = parseInput(z.object({ refundId: v.id, approve: z.boolean(), note: z.string().trim().max(500).optional().nullable() }), input);
  if (failure) return failure;
  const res = await academyRpc("academy_review_refund", { p_refund: data.refundId, p_approve: data.approve, p_note: data.note || null });
  if (res.ok) refresh(["/admin/academy/orders", "/admin/academy/orders", "/academy/payments"]);
  return res.ok ? ok({ message: data.approve ? "Approved. Now send it to the payment gateway." : "Declined. The student was told." }) : res;
}

export async function processRefundAction(input) {
  const { user, limited } = await staffGate("refund", 60);
  if (limited) return limited;
  const { data, failure } = parseInput(z.object({ refundId: v.id }), input);
  if (failure) return failure;
  const res = await processRefund({ refundId: data.refundId, actorId: user.id });
  refresh(["/admin/academy/orders", "/admin/academy/orders", "/admin/academy/orders", "/academy/payments"]);
  return res;
}

/** Staff-started refund: record the decision, then send it to the gateway. If the gateway refuses, the refund stays "failed" and visible. */
export async function startRefundAction(input) {
  const { user, limited } = await staffGate("refund", 60);
  if (limited) return limited;
  const { data, failure } = parseInput(z.object({ orderId: v.id, amount: z.string().trim(), reason: z.string().trim().min(3, "Give a reason (at least 3 characters).").max(500), revokeAccess: z.boolean() }), input);
  if (failure) return failure;
  const minor = toMinor(data.amount);
  if (!minor) return fail("Enter an amount like 500 or 499.50.", { code: "validation", fieldErrors: { amount: "Invalid amount" } });
  const created = await academyRpc("academy_staff_refund", { p_order: data.orderId, p_amount: minor, p_reason: data.reason, p_revoke_access: data.revokeAccess });
  if (!created.ok) return created;
  const sent = await processRefund({ refundId: created.data, actorId: user.id });
  refresh(["/admin/academy/orders", "/admin/academy/orders", "/admin/academy/orders", "/academy/payments"]);
  return sent;
}

export async function reconcileOrderAction(input) {
  const { user, limited } = await staffGate("reconcile", 60);
  if (limited) return limited;
  const { data, failure } = parseInput(z.object({ orderId: v.id }), input);
  if (failure) return failure;
  const res = await reconcileOrder({ orderId: data.orderId, actorId: user.id });
  refresh(["/admin/academy/orders", "/admin/academy/orders"]);
  return res;
}

// ── Grading ────────────────────────────────────────────────────────────────
export async function gradeSubmissionAction(input) {
  const { limited } = await staffGate("grade", 300);
  if (limited) return limited;
  const { data, failure } = parseInput(z.object({ submissionId: v.id, action: z.enum(["grade", "return"]), scores: z.record(z.string().regex(/^[a-z][a-z0-9_]{1,29}$/), z.coerce.number().int().min(0).max(1000)).optional().nullable(), score: z.union([z.literal(""), z.null(), z.undefined(), z.coerce.number().int().min(0).max(1000)]).transform((x) => (x === "" || x == null ? null : Number(x))), feedback: z.string().trim().max(4000).optional().nullable() }), input);
  if (failure) return failure;
  const res = await academyRpc("academy_grade_submission", { p_submission: data.submissionId, p_scores: data.scores ?? null, p_score: data.score, p_feedback: data.feedback || null, p_action: data.action });
  if (res.ok) refresh(["/admin/academy/assignments", "/academy/assignments", "/academy/dashboard"]);
  return res.ok ? ok({ message: data.action === "return" ? "Sent back to the student." : res.data?.passed ? "Graded: passed. The student was told." : "Graded: not passed yet. The student was told." }) : res;
}

// ── Live classes, announcements ────────────────────────────────────────────
export async function saveLiveSessionAction(sessionId, input) {
  const { limited } = await staffGate("live", 120);
  if (limited) return limited;
  const { data, failure } = parseInput(v.liveSessionSchema, input);
  if (failure) return failure;
  const { meeting_url, recording_url, ...row } = data;
  const supabase = await createClient();
  const res = sessionId
    ? await supabase.from("academy_live_sessions").update(row).eq("id", sessionId).select("id").maybeSingle()
    : await supabase.from("academy_live_sessions").insert(row).select("id").single();
  if (res.error) return rpcFailure(res.error);
  if (!res.data) return fail("You do not have permission to do that.", { code: "forbidden" });
  const links = await supabase.from("academy_live_session_links").upsert({ session_id: res.data.id, meeting_url, recording_url }, { onConflict: "session_id" });
  if (links.error) return rpcFailure(links.error);
  refresh(["/admin/academy/live", "/academy/dashboard"]);
  return ok({ id: res.data.id, message: sessionId ? "Class updated." : "Class scheduled." });
}

export async function postAnnouncementAction(input) {
  const { limited } = await staffGate("announce", 30);
  if (limited) return limited;
  const { data, failure } = parseInput(v.announcementSchema, input);
  if (failure) return failure;
  const res = await academyRpc("academy_post_announcement", { p_course: data.course_id, p_title: data.title, p_message: data.message });
  if (res.ok) refresh(["/admin/academy/live", "/academy/dashboard"]);
  return res.ok ? ok({ message: `Posted. ${res.data.recipients} ${res.data.recipients === 1 ? "student was" : "students were"} notified.` }) : res;
}

// ── Settings ───────────────────────────────────────────────────────────────
export async function saveSettingAction(key, raw) {
  const schema = v.settingSchemas[key];
  if (!schema) return fail("Unknown setting.", { code: "invalid" });
  const { limited } = await staffGate("setting", 60);
  if (limited) return limited;
  const { data, failure } = parseInput(z.object({ value: schema }), { value: raw });
  if (failure) return failure;
  const res = await academyRpc("academy_set_setting", { p_key: key, p_value: data.value });
  if (res.ok) refresh(["/admin/academy/settings", "/academy", "/academy/pricing", "/academy/courses"]);
  return res.ok ? ok({ message: "Saved." }) : res;
}

// ── Certificates ───────────────────────────────────────────────────────────
export async function issueCertificateAction(input) {
  const { user, limited } = await staffGate("issue", 120);
  if (limited) return limited;
  const { data, failure } = parseInput(z.object({ enrollmentId: v.id }), input);
  if (failure) return failure;
  const res = await issueCertificate({ enrollmentId: data.enrollmentId, actorId: user.id });
  refresh(["/admin/academy/certificates", "/academy/certificates"]);
  return res.ok ? ok({ message: res.existing ? `Already issued: ${res.certificateId}.` : `Issued ${res.certificateId}. The student was told.` }) : res;
}

export async function reissueCertificateAction(input) {
  const { user, limited } = await staffGate("issue", 60);
  if (limited) return limited;
  const { data, failure } = parseInput(z.object({ enrollmentId: v.id, certificateId: v.id, note: z.string().trim().min(3, "Say what was corrected.").max(200) }), input);
  if (failure) return failure;
  const res = await issueCertificate({ enrollmentId: data.enrollmentId, actorId: user.id, replaces: data.certificateId, note: data.note });
  refresh(["/admin/academy/certificates", "/academy/certificates"]);
  return res.ok ? ok({ message: `Issued ${res.certificateId}; the earlier certificate is now marked as replaced.` }) : res;
}

export async function bulkIssueAction(input) {
  const { user, limited } = await staffGate("bulk", 20);
  if (limited) return limited;
  const { data, failure } = parseInput(z.object({ courseId: z.union([z.literal(""), z.null(), z.undefined(), v.id]).transform((x) => x || null) }), input);
  if (failure) return failure;
  const res = await bulkIssue({ courseId: data.courseId, actorId: user.id });
  refresh(["/admin/academy/certificates", "/academy/certificates"]);
  if (!res.ok) return res;
  return ok({ message: res.found === 0 ? "No one is waiting for a certificate." : `Issued ${res.issued} of ${res.found}.${res.failures.length ? ` ${res.failures.length} failed: ${res.failures.slice(0, 2).map((f) => `${f.name} (${f.error})`).join("; ")}` : ""}` });
}

export async function approveCertificateAction(input) {
  const { limited } = await staffGate("approve", 240);
  if (limited) return limited;
  const { data, failure } = parseInput(z.object({ enrollmentId: v.id }), input);
  if (failure) return failure;
  const res = await academyRpc("academy_approve_certificate", { p_enrollment: data.enrollmentId });
  if (res.ok) refresh(["/admin/academy/certificates"]);
  return res.ok ? ok({ message: "Approved. You can now issue the certificate." }) : res;
}

export async function revokeCertificateAction(input) {
  const { limited } = await staffGate("revoke", 60);
  if (limited) return limited;
  const { data, failure } = parseInput(v.revokeSchema, input);
  if (failure) return failure;
  const res = await academyRpc("academy_revoke_certificate", { p_id: data.id, p_reason: data.reason, p_public_note: data.publicNote });
  if (res.ok) refresh(["/admin/academy/certificates", "/academy/certificates", "/academy/verify"]);
  return res.ok ? ok({ message: "Revoked. The verification page shows it as revoked now, and the holder was told." }) : res;
}

// ── Certificate templates ──────────────────────────────────────────────────
export async function saveTemplateAction(templateId, input) {
  const { limited } = await staffGate("template", 60);
  if (limited) return limited;
  const { data, failure } = parseInput(v.templateSchema, input);
  if (failure) return failure;
  const res = await academyRpc("academy_save_template", { p_id: templateId || null, p_name: data.name, p_description: data.description, p_is_default: data.is_default, p_active: data.active });
  if (res.ok) refresh(["/admin/academy/templates"]);
  return res.ok ? ok({ id: res.data, message: "Template saved." }) : res;
}

export async function createTemplateVersionAction(input) {
  const { limited } = await staffGate("template", 40);
  if (limited) return limited;
  const { data, failure } = parseInput(z.object({ templateId: v.id, fileId: v.id, notes: z.string().trim().max(300).optional().nullable() }), input);
  if (failure) return failure;
  const res = await createTemplateVersion({ templateId: data.templateId, fileId: data.fileId, notes: data.notes || null });
  if (res.ok) refresh(["/admin/academy/templates"]);
  return res.ok ? ok({ id: res.data, message: "Uploaded as a new draft version. Place the fields, test it, then activate it." }) : res;
}

export async function saveTemplateFieldsAction(versionId, fields) {
  const { limited } = await staffGate("template", 240);
  if (limited) return limited;
  const parsed = v.certFieldsSchema.safeParse(fields);
  if (!parsed.success) return fail("A field is not valid. " + (parsed.error.issues[0]?.message ?? ""), { code: "validation" });
  const res = await academyRpc("academy_save_template_fields", { p_version: versionId, p_fields: parsed.data });
  if (!res.ok) return res;
  if (res.data?.length) return fail(`Not saved: ${res.data.join("; ")}.`, { code: "validation", problems: res.data });
  refresh(["/admin/academy/templates"]);
  return ok({ message: "Fields saved." });
}

export async function activateTemplateVersionAction(versionId) {
  const { limited } = await staffGate("template", 60);
  if (limited) return limited;
  const res = await academyRpc("academy_activate_template_version", { p_version: versionId });
  if (!res.ok) return res;
  if (res.data?.length) return fail(`Cannot activate yet: ${res.data.join("; ")}.`, { code: "validation", problems: res.data });
  refresh(["/admin/academy/templates"]);
  return ok({ message: "This version is now live. New certificates use it; ones already issued are unchanged." });
}

export async function deactivateTemplateVersionAction(versionId) {
  const { limited } = await staffGate("template", 60);
  if (limited) return limited;
  const res = await academyRpc("academy_deactivate_template_version", { p_version: versionId });
  if (res.ok) refresh(["/admin/academy/templates"]);
  return res.ok ? ok({ message: "Deactivated." }) : res;
}

export async function assignTemplateAction(courseId, templateId) {
  const { limited } = await staffGate("template", 120);
  if (limited) return limited;
  const res = await academyRpc("academy_assign_template", { p_course: courseId, p_template: templateId || null });
  if (res.ok) refresh(["/admin/academy/templates", "/admin/academy/courses"]);
  return res.ok ? ok({ message: "Saved." }) : res;
}

export async function previewTemplateAction(versionId, fields) {
  const { limited } = await staffGate("preview", 120);
  if (limited) return limited;
  const parsed = v.certFieldsSchema.safeParse(fields);
  if (!parsed.success) return fail("A field is not valid. " + (parsed.error.issues[0]?.message ?? ""), { code: "validation" });
  return previewTemplate({ versionId, fields: parsed.data });
}

/** The template picker on a course's page sends `{ template_id }`; an empty value means "use the default template". */
export async function assignTemplateFormAction(courseId, input) {
  return assignTemplateAction(courseId, input?.template_id || null);
}
