"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireProfile, requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { removeStoredFiles } from "@/lib/services/purge";
import { fail, ok, parseInput } from "@/lib/actions/result";
import { enforceRateLimit } from "@/lib/rate-limit";
import * as admin from "@/lib/services/admin";
import { executeAccountDeletion } from "@/lib/services/account-deletion";
import { startPasswordReset } from "@/lib/services/auth-email";
import * as campus from "@/lib/services/campus";
import * as broadcast from "@/lib/services/broadcast";
import { broadcastSchema, previewSchema } from "@/lib/validators/broadcast";
import { suggestTriage } from "@/lib/services/report-triage";
import { FLAG_META, SETTING_META } from "@/lib/admin/settings-meta";
import * as v from "@/lib/validators/admin";

/**
 * Admin Server Actions. Each one is a thin, validated wrapper: authorisation happens in the database
 * (a SECURITY DEFINER function re-checks the caller's permission for the record's college), so a forged
 * request from a non-staff member simply fails there.
 */
async function staff(schema, input, run) {
  await requireProfile();
  const { data, failure } = parseInput(schema, input);
  if (failure) return failure;
  const res = await run(data);
  if (res.ok) revalidatePath("/admin", "layout");
  return res;
}

// Reports
export const assignReportAction = async (input) => staff(z.object({ id: v.id, assign: z.boolean() }), input, (d) => admin.assignReport(d.id, d.assign));
export const addReportNoteAction = async (input) => staff(v.noteSchema, input, (d) => admin.addReportNote(d.id, d.note));
export async function suggestTriageAction(input) {
  const { user } = await requireProfile();
  const { data, failure } = parseInput(z.object({ id: v.id }), input);
  if (failure) return failure;
  const res = await suggestTriage({ reportId: data.id, userId: user.id });
  if (res.ok) revalidatePath("/admin/reports", "layout");
  return res;
}
export const resolveReportAction = async (input) => staff(v.resolveReportSchema, input, (d) => admin.resolveReport(d.id, d.action, d.reason));

// Members and content
export const moderateUserAction = async (input) => staff(v.moderateUserSchema, input, (d) => admin.moderateUser(d.userId, d.action, d.reason, d.days ?? null));
export const addUserNoteAction = async (input) => staff(v.userNoteSchema, input, (d) => admin.addUserNote(d.userId, d.note));
export const editUserProfileAction = async (input) => staff(v.userProfileEditSchema, input, (d) => admin.updateUserProfile(d));

/** Signs the member out everywhere (their refresh tokens are deleted). Rate limited: it is disruptive for the member. */
export async function revokeUserSessionsAction(input) {
  const { user } = await requireProfile();
  const limited = await enforceRateLimit("admin-sessions", user.id, { limit: 20, windowSec: 600 });
  if (limited) return limited;
  return staff(v.userSessionsSchema, input, async (d) => {
    const res = await admin.revokeUserSessions(d.userId, d.reason);
    return res.ok ? ok({ message: `Signed out of ${res.data} session${res.data === 1 ? "" : "s"}.` }) : res;
  });
}

/**
 * Sends the member the normal password-reset email (the same link a member gets from "Forgot password"). The
 * permission is checked, and the attempt recorded, before anything is sent; the staff member never sees the link.
 */
export async function sendRecoveryAction(input) {
  const { user } = await requireProfile();
  const limited = await enforceRateLimit("admin-recovery", user.id, { limit: 10, windowSec: 3600 });
  if (limited) return limited;
  return staff(v.userRecoverySchema, input, async (d) => {
    const detail = await admin.mutate("admin_user_detail", { p_id: d.userId });
    if (!detail.ok) return detail;
    const audited = await admin.auditUserEvent(d.userId, "user.recovery_requested");
    if (!audited.ok) return audited;
    const sent = await startPasswordReset(detail.data.email);
    return sent.sent ? ok({ message: "Recovery email sent." }) : fail("The email could not be sent. Please try again.", { code: "email_failed" });
  });
}
export const moderatePostAction = async (input) => staff(v.moderateContentSchema, input, (d) => admin.moderateContent("post", d.id, d.action, d.reason));
export const setListingRemovedAction = async (input) => staff(v.listingSchema, input, (d) => admin.setListingRemoved(d.kind, d.id, d.removed, d.reason));

// Permanent deletion. Global administrators only (the database checks that), in three steps in the console: see what it takes,
// give a reason, then type the item's address and the administrator's own password. A stolen session cannot delete anything.
export async function contentImpactAction(input) {
  await requireProfile();
  const { data, failure } = parseInput(v.contentImpactSchema, input);
  if (failure) return failure;
  return admin.contentImpact(data.kind, data.id);
}
export async function userImpactAction(input) {
  await requireProfile();
  const { data, failure } = parseInput(v.userImpactSchema, input);
  if (failure) return failure;
  return admin.userImpact(data.userId);
}

/** Checks the administrator's own password, rate limited: this is the step that stops a hijacked session. Returns a failure or null. */
async function confirmPassword(user, profileId, password) {
  if (!user.email) return fail("Please sign in again.", { code: "no_session" });
  const limited = await enforceRateLimit("admin-purge-password", profileId, { limit: 5, windowSec: 900 });
  if (limited) return limited;
  const { error } = await (await createClient()).auth.signInWithPassword({ email: user.email, password });
  return error ? fail("Please correct the highlighted fields.", { code: "validation", fieldErrors: { password: "That password is not correct" } }) : null;
}

export async function purgeContentAction(input) {
  const { user, profile } = await requireProfile();
  const { data, failure } = parseInput(v.purgeContentSchema, input);
  if (failure) return failure;
  const limited = await enforceRateLimit("admin-purge", profile.id, { limit: 20, windowSec: 3600 });
  if (limited) return limited;
  const wrong = await confirmPassword(user, profile.id, data.password);
  if (wrong) return wrong;
  const res = await admin.purgeContent(data.kind, data.id, data.reason, data.confirm);
  if (!res.ok) return res;
  await removeStoredFiles(res.data?.files);
  for (const path of ["/feed", "/communities", "/events", "/explore"]) revalidatePath(path);
  revalidatePath("/admin", "layout");
  return ok({ message: `The ${data.kind} was permanently deleted.`, counts: res.data?.counts ?? {} });
}

/**
 * Erases a member's whole account. It first passes the same database checks as the other purges (global administrator, not
 * yourself, not staff, a reason, the username typed back), then reuses the account-deletion routine, so a member erased here
 * loses exactly what a member erasing themselves loses (and what the law lets us keep is kept; see docs/DPDP_RETENTION.md).
 */
export async function purgeUserAction(input) {
  const { user, profile } = await requireProfile();
  const { data, failure } = parseInput(v.purgeUserSchema, input);
  if (failure) return failure;
  const limited = await enforceRateLimit("admin-purge", profile.id, { limit: 20, windowSec: 3600 });
  if (limited) return limited;
  const wrong = await confirmPassword(user, profile.id, data.password);
  if (wrong) return wrong;
  const prepared = await admin.prepareUserPurge(data.userId, data.confirm, data.reason);
  if (!prepared.ok) return prepared;
  const erased = await executeAccountDeletion(data.userId, { requestId: null, eraseMessages: data.eraseMessages });
  revalidatePath("/admin", "layout");
  return erased.ok
    ? ok({ message: "The account was permanently erased." })
    : fail("The account could not be erased completely. Nothing is lost: try again in a minute.", { code: "erasure_incomplete" });
}

// Appeals: staff review
export const reviewAppealAction = async (input) => staff(v.reviewAppealSchema, input, (d) => admin.reviewAppeal(d.id, d.decision, d.note));

/** A member appeals a decision. Works while suspended, so it only needs a signed-in user. */
export async function submitAppealAction(input) {
  const user = await requireUser();
  const { data, failure } = parseInput(v.submitAppealSchema, input);
  if (failure) return failure;
  const limited = await enforceRateLimit("appeal", user.id, { limit: 5, windowSec: 86400 });
  if (limited) return limited;
  const res = await admin.submitAppeal({ message: data.message, actionId: data.actionId ?? null });
  if (res.ok) {
    revalidatePath("/suspended");
    revalidatePath("/settings/security");
    return ok({ message: "Your appeal was sent. A different moderator will review it." });
  }
  return res;
}

// Roles
export async function grantRoleAction(input) {
  return staff(v.grantRoleSchema, input, async (d) => {
    const target = await admin.findUserByUsername(d.username);
    if (!target) return fail("No member with that exact username was found in your scope.", { code: "not_found", fieldErrors: { username: "No such member." } });
    const collegeId = d.role === "global_admin" || d.role === "privacy_officer" ? null : (d.collegeId ?? target.college_id ?? null);
    if (d.role === "college_admin" && !collegeId) return fail("Choose a college.", { fieldErrors: { collegeId: "Required" } });
    return admin.grantRole({ userId: target.id, role: d.role, collegeId });
  });
}
export const revokeRoleAction = async (input) => staff(z.object({ id: v.id }), input, (d) => admin.revokeRole(d.id));

// Account deletion: staff approval erases the account straight away (the worker retries on failure)
export async function reviewDeletionAction(input) {
  return staff(z.object({ id: v.id, decision: z.enum(["approve", "reject"]) }), input, async (d) => {
    const res = await admin.reviewDeletion(d.id, d.decision);
    if (!res.ok || d.decision === "reject") return res;
    const erased = await executeAccountDeletion(res.data);
    return erased.ok ? ok({ message: "Account permanently deleted." }) : ok({ message: "Approved. Erasure will be retried automatically." });
  });
}

// Settings and flags
export async function setSettingAction(input) {
  return staff(z.object({ key: z.string().max(64), value: z.unknown() }), input, async (d) => {
    const meta = SETTING_META[d.key];
    if (!meta) return fail("Unknown setting.", { code: "unknown_setting" });
    const parsed = meta.schema.safeParse(d.value);
    if (!parsed.success) return fail(`Invalid value: ${parsed.error.issues[0]?.message ?? "check the format"}.`, { code: "validation" });
    return admin.setSetting(d.key, parsed.data);
  });
}
export async function setFlagAction(input) {
  return staff(z.object({ key: z.string().max(64), enabled: z.boolean() }), input, async (d) => {
    if (!FLAG_META[d.key]) return fail("Unknown feature flag.", { code: "unknown_flag" });
    return admin.setFlag(d.key, d.enabled);
  });
}

// Support inbox
export const setContactStatusAction = async (input) =>
  staff(z.object({ id: v.id, status: z.enum(["new", "in_progress", "resolved", "spam"]) }), input, (d) => admin.setContactStatus(d.id, d.status));

// College directory
export const updateCollegeListingAction = async (input) => staff(v.collegeListingSchema, input, (d) => admin.updateCollegeListing(d));
export const addCollegeAliasAction = async (input) => staff(v.collegeAliasSchema, input, (d) => admin.addCollegeAlias(d.collegeId, d.alias));
export const mergeCollegesAction = async (input) => staff(v.collegeMergeSchema, input, (d) => admin.mergeColleges(d.sourceId, d.targetId, d.reason));
export const resolveCollegeReportAction = async (input) => staff(v.collegeReportDecisionSchema, input, (d) => admin.resolveCollegeReport(d.id, d.decision, d.note));

// Departments and courses (the ones members add are checked here)
export const saveAcademicItemAction = async (input) => staff(v.academicItemSchema, input, async (d) => {
  const res = await admin.saveAcademicItem(d);
  return res.ok ? ok({ message: "Saved." }) : res;
});
export const deleteAcademicItemAction = async (input) => staff(z.object({ kind: z.enum(["department", "program"]), id: v.id }), input, async (d) => {
  const res = await admin.deleteAcademicItem(d.kind, d.id);
  return res.ok ? ok({ message: "Removed. Profiles that used it just lose that line." }) : res;
});

// Skills and interests offered by the pickers
export const saveSkillAction = async (input) => staff(v.skillSchema, input, async (d) => {
  const res = await admin.saveSkill(d);
  return res.ok ? ok({ message: d.id ? "Saved." : "Added." }) : res;
});
export const deleteSkillAction = async (input) => staff(z.object({ id: v.id }), input, async (d) => {
  const res = await admin.deleteSkill(d.id);
  return res.ok ? ok({ message: "Removed. Members who already have it keep it on their profile." }) : res;
});

// Broadcasts: a notification to a chosen audience. Rate limited because it interrupts a lot of people and cannot be unsent.
export async function previewBroadcastAction(input) {
  const { user } = await requireProfile();
  const limited = await enforceRateLimit("admin-broadcast-preview", user.id, { limit: 60, windowSec: 600 });
  if (limited) return limited;
  return staff(previewSchema, input, (d) => broadcast.previewBroadcast(d));
}
export async function sendBroadcastAction(input) {
  const { user } = await requireProfile();
  const limited = await enforceRateLimit("admin-broadcast", user.id, { limit: 10, windowSec: 3600 });
  if (limited) return limited;
  const res = await staff(broadcastSchema, input, (d) => broadcast.sendBroadcast(d));
  if (res.ok) revalidatePath("/admin/broadcast");
  return res;
}

// Announcements (publishing reuses publishAnnouncementAction in lib/actions/campus.js)
export const archiveAnnouncementByIdAction = async (input) => staff(z.object({ id: v.id }), input, (d) => campus.archiveAnnouncement(d.id));
