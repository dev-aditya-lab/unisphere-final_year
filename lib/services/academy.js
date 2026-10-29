import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { dbError, fail, ok } from "@/lib/actions/result";
import { ACADEMY_ERRORS, ACADEMY_EXCEPTIONS } from "@/lib/academy/constants";

/**
 * Academy data access. Everything goes through the caller's own Supabase session (a visitor's, a student's or a staff member's),
 * so Row Level Security and the database functions decide what comes back and what is allowed. Nothing here grants anything.
 */

export const PAGE = 12;

/** Run a database function and turn its two kinds of failure (`{ ok:false, error }` returned, or an exception raised) into one shape. */
export async function academyRpc(name, args = {}) {
  const { data, error } = await (await createClient()).rpc(name, args);
  if (error) return rpcFailure(error);
  if (data && typeof data === "object" && !Array.isArray(data) && data.ok === false) {
    return fail(ACADEMY_ERRORS[data.error] ?? ACADEMY_EXCEPTIONS[data.error] ?? "That could not be done.", { code: data.error, data });
  }
  return ok({ data });
}

export function rpcFailure(error) {
  const msg = String(error?.message ?? "");
  for (const [k, text] of Object.entries(ACADEMY_EXCEPTIONS)) if (msg.includes(k)) return fail(text, { code: k });
  if (error?.code === "23505") return fail("That already exists (a code, address or name must be unique).", { code: "duplicate" });
  if (error?.code === "23503") return fail("That is still in use somewhere else.", { code: "in_use" });
  return dbError(error);
}

// ── Settings and categories ────────────────────────────────────────────────
export const getAcademySettings = cache(async () => {
  const { data: settings } = await (await createClient()).rpc("academy_public_settings");
  const s = settings ?? {};
  return {
    salesEnabled: s.sales_enabled === true,
    currency: s.currency ?? "INR",
    taxMode: s.tax_mode ?? "none",
    taxRateBps: Number(s.tax_rate_bps ?? 0),
    taxLabel: s.tax_label ?? "Tax",
    couponWithSale: s.coupon_with_sale ?? "allow",
    refundWindowDays: Number(s.refund_window_days ?? 7),
    organization: s.issuing_organization ?? "UniSphere Academy",
    supportEmail: s.support_email || "",
  };
});

export const listCategories = cache(async () => {
  const { data: rows } = await (await createClient()).from("academy_categories").select("id, slug, name, code_prefix, description, active").eq("active", true).order("position");
  return rows ?? [];
});

// ── Catalogue ──────────────────────────────────────────────────────────────
const CARD = "id, code, slug, kind, title, short_description, level, delivery_mode, language, duration_label, duration_minutes, skills, tags, cover_key, starts_at, enrollment_limit, published_at, category:academy_categories(name, slug, code_prefix)";

/** Prices for a page of courses (the pricing engine, no coupon): { [courseId]: { total_minor, list_minor, sale, free, ... } }. */
export async function getPrices(ids) {
  if (!ids?.length) return {};
  const { data: prices } = await (await createClient()).rpc("academy_catalog_prices", { p_courses: ids.slice(0, 60) });
  return prices ?? {};
}

export async function listCourses({ kind = null, category = null, level = null, mode = null, q = null, sort = "new", page = 1, pageSize = PAGE } = {}) {
  const supabase = await createClient();
  let query = supabase.from("academy_courses").select(CARD, { count: "exact" }).eq("status", "published");
  if (kind) query = query.eq("kind", kind);
  if (level) query = query.eq("level", level);
  // Live classes are also part of a hybrid course, so asking for "live" includes it.
  if (mode) query = query.in("delivery_mode", mode === "live" ? ["live", "hybrid"] : [mode]);
  if (category) {
    const { data: cat } = await supabase.from("academy_categories").select("id").eq("slug", category).maybeSingle();
    query = query.eq("category_id", cat?.id ?? "00000000-0000-0000-0000-000000000000");
  }
  const term = String(q ?? "").trim().replace(/[%,()*]/g, " ").slice(0, 60);
  if (term) query = query.or(`title.ilike.%${term}%,short_description.ilike.%${term}%,code.ilike.%${term}%`);
  query = sort === "title" ? query.order("title") : query.order("published_at", { ascending: false, nullsFirst: false });
  const from = (Math.max(1, page) - 1) * pageSize;
  const { data: rows, count } = await query.range(from, from + pageSize - 1);
  const courses = rows ?? [];
  return { courses, total: count ?? 0, prices: await getPrices(courses.map((c) => c.id)) };
}

export async function featuredCourses(limit = 6) {
  const { courses, prices } = await listCourses({ pageSize: limit });
  return { courses, prices };
}

export const getCourseDetail = cache(async (slug, kind = null) => {
  const supabase = await createClient();
  const { data: course } = await supabase.from("academy_courses").select("*, category:academy_categories(name, slug, code_prefix)").eq("slug", slug).maybeSingle();
  if (!course || (kind && course.kind !== kind)) return null;
  const [modules, lessons, mentors, cohorts, prices] = await Promise.all([
    supabase.from("academy_modules").select("id, title, summary, position").eq("course_id", course.id).order("position"),
    supabase.from("academy_lessons").select("id, module_id, title, kind, duration_minutes, position, is_preview").eq("course_id", course.id).order("position"),
    supabase.from("academy_course_mentors").select("role, position, mentor:academy_mentors(user_id, display_name, headline, bio, photo_key, expertise, experience_years, linkedin_url, website_url)").eq("course_id", course.id).order("position"),
    supabase.from("academy_cohorts").select("id, name, starts_at, ends_at, capacity, status").eq("course_id", course.id).eq("status", "open").order("starts_at"),
    getPrices([course.id]),
  ]);
  const byModule = new Map();
  for (const l of lessons.data ?? []) byModule.set(l.module_id, [...(byModule.get(l.module_id) ?? []), l]);
  return {
    course,
    syllabus: (modules.data ?? []).map((m) => ({ ...m, lessons: byModule.get(m.id) ?? [] })),
    lessonCount: lessons.data?.length ?? 0,
    mentors: (mentors.data ?? []).map((m) => ({ role: m.role, ...m.mentor })).filter((m) => m.display_name),
    cohorts: cohorts.data ?? [],
    price: prices[course.id] ?? null,
  };
});

/** The text of a preview lesson, for the public course page. RLS lets a visitor read only lessons marked as preview. */
export async function getPreviewContent(lessonId) {
  const { data: row } = await (await createClient()).from("academy_lesson_content").select("body_md, video_provider, video_ref").eq("lesson_id", lessonId).maybeSingle();
  return row ?? null;
}

export async function listMentors() {
  const { data: rows } = await (await createClient()).from("academy_mentors").select("user_id, display_name, headline, bio").eq("active", true).order("display_name");
  return rows ?? [];
}

export async function quoteFor({ courseId, cohortId = null, coupon = null }) {
  const { data: q, error } = await (await createClient()).rpc("academy_quote", { p_course: courseId, p_cohort: cohortId, p_coupon: coupon });
  if (error) return rpcFailure(error);
  return q?.ok ? ok({ quote: q }) : fail(ACADEMY_ERRORS[q?.error] ?? "That could not be priced.", { code: q?.error });
}

export async function verifyCertificate(certificateId) {
  const { data: result, error } = await (await createClient()).rpc("academy_verify_certificate", { p_id: certificateId });
  if (error) return { status: "error" };
  return result ?? { status: "not_found" };
}

// ── Student ────────────────────────────────────────────────────────────────
export async function getMyAcademyProfile(userId) {
  const { data: row } = await (await createClient()).from("academy_profiles").select("certificate_name, share_score, share_project").eq("user_id", userId).maybeSingle();
  return row ?? { certificate_name: null, share_score: false, share_project: false };
}

/** Progress per course from stored facts: lessons done out of lessons in the course. */
async function progressFor(userId, courseIds) {
  if (!courseIds.length) return {};
  const supabase = await createClient();
  const [lessons, done] = await Promise.all([
    supabase.from("academy_lessons").select("id, course_id").in("course_id", courseIds),
    supabase.from("academy_lesson_progress").select("lesson_id, course_id").eq("user_id", userId).in("course_id", courseIds),
  ]);
  const out = Object.fromEntries(courseIds.map((id) => [id, { total: 0, done: 0 }]));
  for (const l of lessons.data ?? []) out[l.course_id].total += 1;
  for (const d of done.data ?? []) out[d.course_id].done += 1;
  return out;
}

export async function getMyEnrollments(userId) {
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("academy_enrollments")
    .select("id, status, source, enrolled_at, access_expires_at, completed_at, cohort_id, verify_consent_at, certificate_approved_at, course:academy_courses(id, code, slug, kind, title, short_description, cover_key, duration_label, status, certificate_criteria, category:academy_categories(name, code_prefix))")
    .eq("user_id", userId)
    .order("enrolled_at", { ascending: false });
  const list = (rows ?? []).filter((r) => r.course);
  const progress = await progressFor(userId, list.map((r) => r.course.id));
  return list.map((r) => ({ ...r, progress: progress[r.course.id] ?? { total: 0, done: 0 }, hasAccess: ["active", "completed"].includes(r.status) && (!r.access_expires_at || new Date(r.access_expires_at) > new Date()) }));
}

export async function getUpcomingSessions(userId, limit = 5) {
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("academy_live_sessions")
    .select("id, title, starts_at, ends_at, status, course_id, course:academy_courses(title, slug, kind)")
    .eq("status", "scheduled").gt("ends_at", new Date().toISOString()).order("starts_at").limit(limit);
  void userId;
  return rows ?? [];
}

export async function getAssignmentsForMe(userId) {
  const supabase = await createClient();
  const enrolled = (await getMyEnrollments(userId)).filter((e) => e.hasAccess).map((e) => e.course.id);
  if (!enrolled.length) return [];
  const [assignments, submissions] = await Promise.all([
    supabase.from("academy_assignments").select("id, course_id, title, summary, due_at, max_score, pass_pct, formats, allow_resubmission, max_attempts, allow_late, required_for_certificate, rubric, course:academy_courses(title, slug, code)").eq("status", "published").in("course_id", enrolled).order("due_at", { nullsFirst: false }),
    supabase.from("academy_submissions").select("id, assignment_id, attempt, status, score, score_pct, passed, feedback, rubric_scores, repo_url, demo_url, notes, file_id, submitted_at, graded_at, is_late").eq("user_id", userId).order("attempt"),
  ]);
  const byAssignment = new Map();
  for (const s of submissions.data ?? []) byAssignment.set(s.assignment_id, [...(byAssignment.get(s.assignment_id) ?? []), s]);
  return (assignments.data ?? []).map((a) => ({ ...a, submissions: byAssignment.get(a.id) ?? [] }));
}

export async function getMyCertificates(userId) {
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("academy_certificates")
    .select("id, certificate_id, status, snapshot, issued_at, revoked_at, revoke_public_note, course_id, enrollment_id, pdf_key")
    .eq("user_id", userId).order("created_at", { ascending: false });
  return (rows ?? []).filter((c) => c.status !== "failed");
}

export async function getMyOrders(userId) {
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("academy_orders")
    .select("id, order_no, status, currency, list_minor, sale_discount_minor, coupon_discount_minor, tax_minor, total_minor, tax_mode, tax_rate_bps, coupon_code, created_at, paid_at, expires_at, items:academy_order_items(course_id, course_code, title, kind), refunds:academy_refunds(id, status, amount_minor, reason, requested_at, completed_at)")
    .eq("user_id", userId).order("created_at", { ascending: false }).limit(50);
  return rows ?? [];
}

export async function getMyAnnouncements(limit = 5) {
  const { data: rows } = await (await createClient()).from("academy_announcements").select("id, title, message, created_at, course:academy_courses(title, slug)").order("created_at", { ascending: false }).limit(limit);
  return rows ?? [];
}

/** The course a student is learning, with everything the player needs. Null if they have no access (and are not staff). */
export async function getLearnData(userId, courseId, lessonId = null) {
  const supabase = await createClient();
  const { data: course } = await supabase.from("academy_courses").select("id, code, slug, kind, title, status, certificate_criteria, category:academy_categories(name)").eq("id", courseId).maybeSingle();
  if (!course) return null;
  const { data: enrollment } = await supabase.from("academy_enrollments").select("id, status, access_expires_at, completed_at, verify_consent_at, certificate_approved_at").eq("user_id", userId).eq("course_id", courseId).in("status", ["active", "completed", "suspended", "expired"]).order("enrolled_at", { ascending: false }).limit(1).maybeSingle();
  const [modules, lessons, progress, state] = await Promise.all([
    supabase.from("academy_modules").select("id, title, summary, position").eq("course_id", courseId).order("position"),
    supabase.from("academy_lessons").select("id, module_id, title, kind, duration_minutes, position, is_preview, pass_pct").eq("course_id", courseId).order("position"),
    supabase.from("academy_lesson_progress").select("lesson_id").eq("user_id", userId).eq("course_id", courseId),
    supabase.rpc("academy_my_progress", { p_course: courseId }),
  ]);
  const byModule = new Map();
  for (const l of lessons.data ?? []) byModule.set(l.module_id, [...(byModule.get(l.module_id) ?? []), l]);
  const syllabus = (modules.data ?? []).map((m) => ({ ...m, lessons: byModule.get(m.id) ?? [] }));
  const flat = syllabus.flatMap((m) => m.lessons);
  const done = new Set((progress.data ?? []).map((p) => p.lesson_id));
  const current = flat.find((l) => l.id === lessonId) ?? flat.find((l) => !done.has(l.id)) ?? flat[0] ?? null;
  const idx = current ? flat.findIndex((l) => l.id === current.id) : -1;

  let content = null, questions = [], assignment = null, submissions = [], resources = [], lastAttempt = null;
  if (current) {
    const [c, q, a, r, qa] = await Promise.all([
      supabase.from("academy_lesson_content").select("body_md, video_provider, video_ref").eq("lesson_id", current.id).maybeSingle(),
      current.kind === "quiz" ? supabase.from("academy_quiz_questions").select("id, prompt, options, multiple, position").eq("lesson_id", current.id).order("position") : { data: [] },
      current.kind === "assignment" ? supabase.from("academy_assignments").select("*").eq("lesson_id", current.id).eq("status", "published").maybeSingle() : { data: null },
      supabase.from("academy_resources").select("id, title, file_id, lesson_id").eq("course_id", courseId).order("position"),
      current.kind === "quiz" ? supabase.from("academy_quiz_attempts").select("score_pct, passed, created_at").eq("user_id", userId).eq("lesson_id", current.id).order("created_at", { ascending: false }).limit(1) : { data: [] },
    ]);
    content = c.data; questions = q.data ?? []; assignment = a.data; resources = (r.data ?? []).filter((x) => !x.lesson_id || x.lesson_id === current.id); lastAttempt = qa.data?.[0] ?? null;
    if (assignment) submissions = (await supabase.from("academy_submissions").select("*").eq("assignment_id", assignment.id).eq("user_id", userId).order("attempt")).data ?? [];
  }
  const [sessions, announcements] = await Promise.all([
    supabase.from("academy_live_sessions").select("id, title, starts_at, ends_at, status, recording_available").eq("course_id", courseId).neq("status", "cancelled").order("starts_at", { ascending: false }).limit(6),
    supabase.from("academy_announcements").select("id, title, message, created_at").eq("course_id", courseId).order("created_at", { ascending: false }).limit(3),
  ]);
  return {
    course, enrollment: enrollment ?? null, syllabus, flat, done: [...done], current, prev: idx > 0 ? flat[idx - 1] : null, next: idx >= 0 ? flat[idx + 1] ?? null : null,
    content, questions, assignment, submissions, resources, lastAttempt, state: state.data ?? null, sessions: sessions.data ?? [], announcements: announcements.data ?? [],
  };
}

/** The meeting and recording addresses for a class, only for someone entitled to them (decided in the database). */
export async function getSessionAccess(sessionId) {
  const { data: access } = await (await createClient()).rpc("academy_session_access", { p_session: sessionId });
  return access ?? null;
}

export async function getDashboard(userId) {
  const enrollments = await getMyEnrollments(userId);
  const active = enrollments.filter((e) => e.hasAccess);
  const [sessions, assignments, certificates, orders, announcements] = await Promise.all([
    getUpcomingSessions(userId, 4), getAssignmentsForMe(userId), getMyCertificates(userId), getMyOrders(userId), getMyAnnouncements(3),
  ]);
  const now = Date.now();
  const due = assignments
    .filter((a) => a.due_at && new Date(a.due_at).getTime() > now - 86_400_000 && !a.submissions.some((s) => s.passed || s.status === "submitted"))
    .sort((a, b) => new Date(a.due_at) - new Date(b.due_at)).slice(0, 4);
  // "Next steps" from what the student has actually done: the lesson to continue, then courses in the categories they study.
  const cats = new Set(active.map((e) => e.course.category?.name).filter(Boolean));
  const owned = new Set(enrollments.map((e) => e.course.id));
  const { courses: more } = await listCourses({ pageSize: 12 });
  const recommended = more.filter((c) => !owned.has(c.id) && (cats.size === 0 || cats.has(c.category?.name))).slice(0, 3);
  return { enrollments, active, sessions, due, assignments, certificates, orders: orders.slice(0, 4), announcements, recommended, prices: await getPrices(recommended.map((c) => c.id)) };
}

