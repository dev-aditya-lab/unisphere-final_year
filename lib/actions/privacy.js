"use server";

import { revalidatePath } from "next/cache";
import { requireProfile, getAuthUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fail, ok, parseInput } from "@/lib/actions/result";
import { enforceRateLimit, getClientIp } from "@/lib/rate-limit";
import { recordConsent } from "@/lib/privacy/consent";
import { enqueueUserContent } from "@/lib/ai/embeddings/jobs";
import { withdrawIdentityDocument } from "@/lib/services/blue-tick";
import {
  addMyMessage, cancelMyRequest, createMemberRequest, createVisitorGrievance, revokeMyNomination, setMyNomination, trackVisitorGrievance,
} from "@/lib/privacy/requests";
import { sendEmail } from "@/lib/email";
import { accountErasureScheduledEmail } from "@/lib/email/templates";
import { safeNext } from "@/lib/safe-redirect";
import { HOME_PATH } from "@/lib/constants";
import {
  consentChoiceSchema, correctionSchema, deleteAccountSchema, grievanceSchema, nominationSchema, otherRequestSchema, replySchema, reviewSchema, trackSchema,
} from "@/lib/validators/privacy";
import { z } from "zod";

/**
 * Privacy Server Actions for members and visitors. Who the caller is comes from the session on the server; the browser
 * never supplies a user id, a consent status for someone else, or a notice version. Pages that must stay reachable while a
 * privacy review is pending (settings, privacy requests, delete account) are exempt from the review gate by path.
 */

// ── Consent ────────────────────────────────────────────────────────────────

/** The review page: the adult declaration and the consent the account rests on. Each one is its own record. */
export async function completePrivacyReviewAction(input) {
  const { profile } = await requireProfile({ allowIncomplete: true });
  const { data, failure } = parseInput(reviewSchema, input);
  if (failure) return failure;
  const limited = await enforceRateLimit("privacy-review", profile.id, { limit: 20, windowSec: 600 });
  if (limited) return limited;

  if (data.age === "under_18") {
    const res = await recordConsent({ userId: profile.id, purpose: "age_confirmation", status: "declined", source: "review" });
    if (!res.ok) return res;
    revalidatePath("/", "layout");
    return ok({ minor: true });
  }
  if (data.acceptCore !== true) return fail("To keep using UniSphere, agree to it using your account information to run your account. Or delete your account instead.", { code: "validation", fieldErrors: { acceptCore: "This is needed to use UniSphere" } });
  const results = [
    await recordConsent({ userId: profile.id, purpose: "age_confirmation", status: "granted", source: "review" }),
    await recordConsent({ userId: profile.id, purpose: "core_service", status: "granted", source: "review" }),
  ];
  const failed = results.find((r) => !r.ok);
  if (failed) return failed;
  revalidatePath("/", "layout");
  return ok({ next: safeNext(data.next, HOME_PATH) });
}

/** Turn an optional purpose on or off. Withdrawing is the same single step as giving. */
export async function setConsentAction(input) {
  const { profile } = await requireProfile({ allowIncomplete: true });
  const { data, failure } = parseInput(consentChoiceSchema, input);
  if (failure) return failure;
  const limited = await enforceRateLimit("consent", profile.id, { limit: 40, windowSec: 600 });
  if (limited) return limited;
  const res = await recordConsent({ userId: profile.id, purpose: data.purpose, status: data.granted ? "granted" : "withdrawn", source: data.source });
  if (!res.ok) return res;
  if (data.purpose === "ai_discovery_index" && data.granted && res.changed) enqueueUserContent(profile.id).catch(() => {});
  if (data.purpose === "identity_verification" && !data.granted) await withdrawIdentityDocument(profile.id);
  revalidatePath("/settings/privacy");
  revalidatePath("/settings/blue-tick");
  return ok({ granted: data.granted, message: data.granted ? "Turned on." : "Turned off." });
}

// ── Requests ───────────────────────────────────────────────────────────────

export async function requestCorrectionAction(input) {
  const { profile } = await requireProfile({ allowIncomplete: true });
  const { data, failure } = parseInput(correctionSchema, input);
  if (failure) return failure;
  const limited = await enforceRateLimit("privacy-request", profile.id, { limit: 6, windowSec: 3600 });
  if (limited) return limited;
  const res = await createMemberRequest({
    kind: "correction",
    subject: `Correction: ${data.field}`,
    details: `Currently: ${data.current || "(not given)"}\nShould be: ${data.requested}\n\n${data.details}`,
    payload: { field: data.field },
  });
  if (res.ok) revalidatePath("/privacy-requests");
  return res;
}

export async function submitOtherRequestAction(input) {
  const { profile } = await requireProfile({ allowIncomplete: true });
  const { data, failure } = parseInput(otherRequestSchema, input);
  if (failure) return failure;
  const limited = await enforceRateLimit("privacy-request", profile.id, { limit: 6, windowSec: 3600 });
  if (limited) return limited;
  const res = await createMemberRequest({ kind: "other", subject: data.subject, details: data.details });
  if (res.ok) revalidatePath("/privacy-requests");
  return res;
}

export async function cancelPrivacyRequestAction(input) {
  await requireProfile({ allowIncomplete: true });
  const { data, failure } = parseInput(z.object({ id: z.uuid() }), input);
  if (failure) return failure;
  const res = await cancelMyRequest(data.id);
  if (res.ok) revalidatePath("/privacy-requests", "layout");
  return res;
}

export async function replyToPrivacyRequestAction(input) {
  const { profile } = await requireProfile({ allowIncomplete: true });
  const { data, failure } = parseInput(replySchema, input);
  if (failure) return failure;
  const limited = await enforceRateLimit("privacy-reply", profile.id, { limit: 20, windowSec: 3600 });
  if (limited) return limited;
  const res = await addMyMessage(data.id, data.message);
  if (res.ok) revalidatePath("/privacy-requests", "layout");
  return res;
}

export async function setNominationAction(input) {
  const { profile } = await requireProfile({ allowIncomplete: true });
  const { data, failure } = parseInput(nominationSchema, input);
  if (failure) return failure;
  const limited = await enforceRateLimit("nomination", profile.id, { limit: 5, windowSec: 3600 });
  if (limited) return limited;
  const res = await setMyNomination(data);
  if (res.ok) revalidatePath("/privacy-requests", "layout");
  return res;
}

export async function revokeNominationAction() {
  await requireProfile({ allowIncomplete: true });
  const res = await revokeMyNomination();
  if (res.ok) revalidatePath("/privacy-requests", "layout");
  return res;
}

// ── Account deletion ───────────────────────────────────────────────────────

/**
 * Starts the 14-day erasure. The member proves it is them with their password (a stolen session cannot erase an account),
 * types DELETE, and says whether the messages they sent should also be erased. The record is created on the server with the
 * service role: the browser cannot create or alter a deletion request itself.
 */
export async function requestAccountDeletionAction(input) {
  const { user, profile } = await requireProfile({ allowIncomplete: true });
  const { data, failure } = parseInput(deleteAccountSchema, input ?? {});
  if (failure) return failure;
  if (!user.email) return fail("Please sign in again.", { code: "no_session" });

  const limited =
    (await enforceRateLimit("deletion", profile.id, { limit: 3, windowSec: 86400 })) ||
    (await enforceRateLimit("deletion-password", profile.id, { limit: 5, windowSec: 900 }));
  if (limited) return limited;

  const supabase = await createClient();
  const { error: verifyError } = await supabase.auth.signInWithPassword({ email: user.email, password: data.password });
  if (verifyError) {
    return fail("Please correct the highlighted fields.", { code: "validation", fieldErrors: { password: "That password is not correct" } });
  }

  const { data: result, error } = await createAdminClient().rpc("request_account_deletion_for", {
    p_user: profile.id, p_reason: data.reason, p_erase_messages: data.eraseMessages,
  });
  if (error) {
    if (error.message.includes("duplicate")) return fail("You already have a deletion in progress.", { code: "duplicate" });
    if (error.message.includes("protected_account")) {
      return fail("Accounts that hold staff roles cannot be deleted until the role is removed. Ask a global administrator to remove it first.", { code: "protected_account" });
    }
    console.error("[deletion] request failed:", error.message);
    return fail("We could not schedule the deletion. Please try again.", { code: "db_error" });
  }
  const when = new Intl.DateTimeFormat("en-IN", { dateStyle: "long", timeZone: "Asia/Kolkata" }).format(new Date(result.scheduled_for));
  sendEmail({ to: user.email, ...accountErasureScheduledEmail({ name: profile.full_name?.split(" ")[0], when }) }).catch(() => {});
  revalidatePath("/delete-account");
  revalidatePath("/privacy-requests", "layout");
  return ok({ scheduledFor: result.scheduled_for, reference: result.reference, message: `Deletion scheduled for ${when}. You can cancel until then.` });
}

export async function cancelAccountDeletionAction() {
  await requireProfile({ allowIncomplete: true });
  const { error } = await (await createClient()).rpc("cancel_my_account_deletion");
  if (error) return fail(error.message.includes("not_found") ? "There is no pending deletion to cancel." : "We could not cancel that. Please try again.", { code: "db_error" });
  revalidatePath("/delete-account");
  revalidatePath("/privacy-requests", "layout");
  return ok({ message: "Deletion cancelled. Your account stays." });
}

// ── Grievances (members and visitors) ──────────────────────────────────────

export async function submitGrievanceAction(input) {
  // A bot fills the hidden field. Answer as if it worked, and do nothing.
  if (input?.website) return ok({ reference: "GR-0000-000000", code: null, dueAt: null, member: false });
  const { data, failure } = parseInput(grievanceSchema, input ?? {});
  if (failure) return failure;

  const ip = await getClientIp();
  const limited = (await enforceRateLimit("grievance-ip", ip, { limit: 5, windowSec: 3600 })) || (data.email && (await enforceRateLimit("grievance-email", data.email, { limit: 3, windowSec: 3600 })));
  if (limited) return limited;

  const user = await getAuthUser();
  if (user) {
    const res = await createMemberRequest({ kind: "grievance", subject: data.subject, details: data.details });
    if (res.ok) revalidatePath("/privacy-requests", "layout");
    return res.ok ? { ...res, member: true } : res;
  }
  if (!data.email) return fail("Please correct the highlighted fields.", { code: "validation", fieldErrors: { email: "We need an email address to reply to you" } });
  const res = await createVisitorGrievance({ name: data.name, email: data.email, subject: data.subject, details: data.details });
  return res.ok ? { ...res, member: false } : res;
}

export async function trackGrievanceAction(input) {
  const { data, failure } = parseInput(trackSchema, input ?? {});
  if (failure) return failure;
  const ip = await getClientIp();
  const limited = await enforceRateLimit("grievance-track", ip, { limit: 15, windowSec: 900 });
  if (limited) return limited;
  const found = await trackVisitorGrievance(data.reference, data.code);
  // The same answer for a wrong reference and a wrong code.
  if (!found) return fail("We could not find a grievance with that reference and code.", { code: "not_found" });
  return ok({ grievance: found });
}
