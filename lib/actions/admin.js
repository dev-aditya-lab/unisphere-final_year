"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireProfile, requireUser } from "@/lib/auth/session";
import { fail, ok, parseInput } from "@/lib/actions/result";
import { enforceRateLimit } from "@/lib/rate-limit";
import * as admin from "@/lib/services/admin";
import { executeAccountDeletion } from "@/lib/services/account-deletion";
import * as campus from "@/lib/services/campus";
import { importRoster } from "@/lib/services/student-id";
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
export const moderateUserAction = async (input) => staff(v.moderateUserSchema, input, (d) => admin.moderateUser(d.userId, d.action, d.reason));
export const moderatePostAction = async (input) => staff(v.moderateContentSchema, input, (d) => admin.moderateContent("post", d.id, d.action, d.reason));
export const setListingRemovedAction = async (input) => staff(v.listingSchema, input, (d) => admin.setListingRemoved(d.kind, d.id, d.removed, d.reason));

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
    const collegeId = d.role === "global_admin" ? null : (d.collegeId ?? target.college_id ?? null);
    if (d.role === "college_admin" && !collegeId) return fail("Choose a college.", { fieldErrors: { collegeId: "Required" } });
    return admin.grantRole({ userId: target.id, role: d.role, collegeId });
  });
}
export const revokeRoleAction = async (input) => staff(z.object({ id: v.id }), input, (d) => admin.revokeRole(d.id));

// Verification
export const reviewVerificationAction = async (input) =>
  staff(v.verificationReviewSchema, input, async (d) => {
    if (d.decision !== "approved" && !d.reason) return fail("Tell the member why, so they can fix it.", { fieldErrors: { reason: "Required" } });
    return admin.reviewVerification(d);
  });

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

// Colleges
export const updateCollegeAction = async (input) =>
  staff(v.collegeSchema, input, (d) =>
    admin.updateCollege(d.id, { name: d.name, short_name: d.shortName || null, city: d.city || null, state: d.state || null, verification_mode: d.verificationMode, is_active: d.isActive }),
  );

// Announcements (publishing reuses publishAnnouncementAction in lib/actions/campus.js)
export const archiveAnnouncementByIdAction = async (input) => staff(z.object({ id: v.id }), input, (d) => campus.archiveAnnouncement(d.id));

// Student ID list (hashing happens on the server; the database only ever receives hashes)
export async function importRosterAction(input) {
  return staff(z.object({ collegeId: v.id, text: z.string().max(400_000) }), input, (d) => importRoster({ collegeId: d.collegeId, text: d.text }));
}
export const manageRosterEntryAction = async (input) =>
  staff(z.object({ id: v.id, action: z.enum(["release", "revoke", "restore"]), reason: z.string().trim().min(3, "Please give a reason").max(500) }), input, (d) => admin.manageRosterEntry(d.id, d.action, d.reason));
