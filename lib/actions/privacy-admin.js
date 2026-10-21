"use server";

import { revalidatePath } from "next/cache";
import { requireProfile, hasPermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { fail, ok, parseInput } from "@/lib/actions/result";
import { enforceRateLimit } from "@/lib/rate-limit";
import { invalidateSettingsCache } from "@/lib/settings";
import { createAdminClient } from "@/lib/supabase/admin";
import { staffUpdateRequest } from "@/lib/privacy/requests";
import * as incidents from "@/lib/privacy/incidents";
import { draftNotice } from "@/lib/privacy/incident-templates";
import { privacyContact } from "@/lib/privacy/config";
import {
  accessReviewSchema, incidentAffectedSchema, incidentCreateSchema, incidentEventSchema, incidentNoticeSchema, incidentPatchSchema, incidentStatusSchema,
  noticeIdSchema, noticeSentSchema, privacySettingSchema, privacySettingSchemas, staffRequestSchema,
} from "@/lib/validators/privacy";
import { z } from "zod";

/**
 * Privacy-staff Server Actions. Each is a thin, validated wrapper: the database re-checks the permission (privacy.requests,
 * privacy.incidents, privacy.incidents.approve, privacy.manage) inside the function it calls, and writes the audit log.
 * The permission is also checked here first wherever a step uses the server's own key, so a member without it cannot
 * even make the server look something up for them.
 */
async function staff(permission, schema, input, run) {
  await requireProfile();
  if (!(await hasPermission(permission))) return fail("You do not have permission to do that.", { code: "forbidden" });
  const { data, failure } = parseInput(schema, input);
  if (failure) return failure;
  const res = await run(data);
  if (res?.ok) revalidatePath("/admin/privacy", "layout");
  return res;
}

// ── Requests ──
export const updatePrivacyRequestAction = async (input) => staff("privacy.requests", staffRequestSchema, input, (d) => staffUpdateRequest(d));

// ── Incidents ──
export const createIncidentAction = async (input) => staff("privacy.incidents", incidentCreateSchema, input, (d) => incidents.createIncident(d));
export const patchIncidentAction = async (input) => staff("privacy.incidents", incidentPatchSchema, input, (d) => incidents.patchIncident(d.id, d.patch));
export const incidentStatusAction = async (input) => staff("privacy.incidents", incidentStatusSchema, input, (d) => incidents.setIncidentStatus(d.id, d.to, d.note));
export const incidentEventAction = async (input) => staff("privacy.incidents", incidentEventSchema, input, (d) => incidents.addIncidentEvent(d.id, d.kind, d.body));
export const incidentAffectedAction = async (input) => staff("privacy.incidents", incidentAffectedSchema, input, (d) => incidents.addAffectedByUsername(d.id, d.usernames));
export const saveIncidentNoticeAction = async (input) => staff("privacy.incidents", incidentNoticeSchema, input, (d) => incidents.saveNotice(d.id, d.audience, d.subject, d.body));
export const approveIncidentNoticeAction = async (input) => staff("privacy.incidents.approve", noticeIdSchema, input, (d) => incidents.approveNotice(d.noticeId));
export const markBoardNoticeSentAction = async (input) => staff("privacy.incidents", noticeSentSchema, input, (d) => incidents.markBoardNoticeSent(d.noticeId, d.reference));

/** Delivers an approved notice to affected members. Rate limited: it sends real email. */
export async function sendIncidentNoticeAction(input) {
  const { user } = await requireProfile();
  const limited = await enforceRateLimit("incident-send", user.id, { limit: 20, windowSec: 3600 });
  if (limited) return limited;
  return staff("privacy.incidents", noticeIdSchema, input, (d) => incidents.sendPrincipalNotice(d.noticeId));
}

/** A starting point generated from the incident record. Marked [to be completed] wherever the record is silent. */
export async function draftIncidentNoticeAction(input) {
  return staff("privacy.incidents", z.object({ id: z.uuid(), audience: z.enum(["principals", "board_initial", "board_detailed"]) }), input, async (d) => {
    const found = await incidents.getIncident(d.id);
    if (!found) return fail("That incident no longer exists.");
    const draft = draftNotice(d.audience, found.incident, { contactName: privacyContact.name, contactEmail: privacyContact.email, contactPhone: privacyContact.phone });
    return ok({ ...draft });
  });
}

// ── Access review and settings ──
export const recordAccessReviewAction = async (input) =>
  staff("privacy.manage", accessReviewSchema, input, async (d) => {
    const { error } = await (await createClient()).rpc("record_privacy_access_review", { p_notes: d.notes });
    return error ? fail("Could not record the review.") : ok({ message: "Review recorded." });
  });

export const setPrivacySettingAction = async (input) =>
  staff("privacy.manage", privacySettingSchema, input, async (d) => {
    const parsed = privacySettingSchemas[d.key].safeParse(d.value);
    if (!parsed.success) return fail("That value is not allowed.", { code: "validation" });
    const { error } = await (await createClient()).rpc("set_privacy_setting", { p_key: d.key, p_value: parsed.data });
    if (error) return fail("Could not save that setting.");
    await invalidateSettingsCache();
    revalidatePath("/privacy-notice");
    return ok({ message: "Saved." });
  });

/** Runs the retention job now (it normally runs by itself every six hours). Service role, after the permission check. */
export const runRetentionNowAction = async (input) =>
  staff("privacy.manage", z.object({}), input ?? {}, async () => {
    const { data, error } = await createAdminClient().rpc("run_privacy_retention", { p_force: true });
    if (error) return fail("The retention job failed. Check the server log.");
    return ok({ message: "Retention job ran.", result: data });
  });
