import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fail, ok } from "@/lib/actions/result";
import { sendEmail } from "@/lib/email";
import { privacyRequestEmail } from "@/lib/email/templates";
import { publicEnv } from "@/lib/env-public";

/**
 * Privacy requests and grievances (migration 0044). Members and staff act through SECURITY DEFINER functions that
 * take the identity from the session; visitors act through service-role functions after rate limiting.
 */

const ERRORS = {
  not_authenticated: "Please sign in again.",
  target_unavailable: "That account is not available.",
  invalid_kind: "That kind of request is not available.",
  invalid_subject: "Give the request a short title (3 to 140 characters).",
  invalid_details: "Please write at least a sentence (10 to 4000 characters).",
  invalid_email: "Enter a valid email address.",
  invalid_name: "Enter a name of 2 to 120 characters.",
  invalid_key: "The request could not be created. Reload and try again.",
  too_many_open: "You already have several open requests. Please wait for one to be answered.",
  not_found: "That request no longer exists.",
  use_account_deletion: "A deletion is cancelled from the delete account page.",
  invalid_state: "That is not possible in the request's current state.",
  already_decided: "This request is already closed.",
  invalid_decision: "Unknown decision.",
  reason_required: "Please give a reason.",
  cannot_review_own_request: "You cannot handle your own request. Another privacy officer has to do it.",
  forbidden: "You do not have permission to do that.",
};

export function privacyError(error, fallback = "Something went wrong. Please try again.") {
  const msg = String(error?.message ?? "");
  const key = Object.keys(ERRORS).find((k) => msg.includes(k));
  if (!key && process.env.NODE_ENV !== "production") console.error("[privacy]", error);
  return fail(key ? ERRORS[key] : fallback, { code: key ?? "db_error" });
}

// ── Members ────────────────────────────────────────────────────────────────

export async function listMyRequests(limit = 50) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("privacy_requests")
    .select("id, reference, kind, status, subject, due_at, created_at, closed_at, outcome_reason")
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

/** One request with the history the requester is allowed to read (row level security hides staff notes). */
export async function getMyRequest(id) {
  const supabase = await createClient();
  const { data: request } = await supabase
    .from("privacy_requests")
    .select("id, reference, kind, status, subject, details, due_at, created_at, closed_at, outcome_reason, user_id")
    .eq("id", id)
    .maybeSingle();
  if (!request) return null;
  const { data: events } = await supabase
    .from("privacy_request_events")
    .select("id, actor_kind, from_status, to_status, note, created_at")
    .eq("request_id", id)
    .order("id", { ascending: true });
  return { request, events: events ?? [] };
}

export async function createMemberRequest({ kind, subject, details, payload = {} }) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_privacy_request", { p_kind: kind, p_subject: subject, p_details: details, p_payload: payload });
  if (error) return privacyError(error);
  return ok({ id: data.id, reference: data.reference, dueAt: data.due_at });
}

export async function cancelMyRequest(id) {
  const { error } = await (await createClient()).rpc("cancel_my_privacy_request", { p_id: id });
  return error ? privacyError(error) : ok({ message: "Request withdrawn." });
}

export async function addMyMessage(id, message) {
  const { error } = await (await createClient()).rpc("add_privacy_request_message", { p_id: id, p_message: message });
  return error ? privacyError(error) : ok({ message: "Sent." });
}

export async function getMyNomination() {
  const { data } = await (await createClient()).from("privacy_nominations").select("nominee_name, nominee_email, relationship, updated_at").maybeSingle();
  return data ?? null;
}

export async function setMyNomination({ name, email, relationship }) {
  const { data, error } = await (await createClient()).rpc("set_my_nomination", { p_name: name, p_email: email, p_relationship: relationship ?? "" });
  return error ? privacyError(error) : ok({ reference: data.reference });
}

export async function revokeMyNomination() {
  const { error } = await (await createClient()).rpc("revoke_my_nomination");
  return error ? privacyError(error) : ok();
}

/** Called only after the member's data was actually produced. Never before. */
export async function recordCompletedAccess(userId) {
  const { data, error } = await createAdminClient().rpc("record_completed_request", {
    p_user: userId,
    p_kind: "access",
    p_subject: "Copy of my data",
    p_note: "Your data was prepared for download.",
  });
  if (error) {
    // The download itself succeeded; failing to write the receipt must not hide it, but it must not be silent either.
    console.error("[privacy] could not record the access request:", error.message);
    return null;
  }
  return data?.reference ?? null;
}

// ── Visitors ───────────────────────────────────────────────────────────────

const sha256 = (s) => createHash("sha256").update(s).digest("hex");
const normaliseCode = (code) => String(code ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/** 16 characters from an alphabet without look-alikes (0/O, 1/I), shown as XXXX-XXXX-XXXX-XXXX. */
function newTrackingCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(16);
  const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
  return chars.match(/.{4}/g).join("-");
}

export async function createVisitorGrievance({ name, email, subject, details }) {
  const code = newTrackingCode();
  const { data, error } = await createAdminClient().rpc("submit_visitor_grievance", {
    p_name: name ?? "",
    p_email: email,
    p_subject: subject,
    p_details: details,
    p_tracking_hash: sha256(normaliseCode(code)),
  });
  if (error) return privacyError(error);
  const url = `${publicEnv.appUrl}/grievance/track`;
  const mail = privacyRequestEmail({
    heading: "We received your grievance",
    reference: data.reference,
    lines: [
      `Your reference is ${data.reference}. To follow its progress, open the tracking page and enter the reference with this code: ${code}`,
      "Keep this email. It is the only place the code is shown again.",
    ],
    cta: { label: "Track your grievance", url },
  });
  // The reference and code are also shown on screen, so a failed email does not lose them.
  sendEmail({ to: email, ...mail }).catch(() => {});
  return ok({ reference: data.reference, code, dueAt: data.due_at });
}

export async function trackVisitorGrievance(reference, code) {
  const { data, error } = await createAdminClient().rpc("track_visitor_grievance", {
    p_reference: reference,
    p_tracking_hash: sha256(normaliseCode(code)),
  });
  if (error) return null;
  return data ?? null;
}

// ── Staff ──────────────────────────────────────────────────────────────────

export async function listRequestsForStaff({ status = "open", kind = null, page = 1, pageSize = 25 }) {
  const { data, error } = await (await createClient()).rpc("list_privacy_requests", {
    p_status: status,
    p_kind: kind,
    p_limit: pageSize,
    p_offset: (page - 1) * pageSize,
  });
  if (error) return { rows: [], total: 0, error: privacyError(error).error };
  return { rows: data ?? [], total: Number(data?.[0]?.total_count ?? 0) };
}

export async function requestDetailForStaff(id) {
  const { data, error } = await (await createClient()).rpc("privacy_request_detail", { p_id: id });
  if (error) return null;
  return data;
}

export async function requestCountsForStaff() {
  const { data } = await (await createClient()).rpc("privacy_request_counts");
  return data ?? { open: 0, overdue: 0, due_soon: 0, grievances_open: 0 };
}

export async function staffUpdateRequest({ id, status, noteRequester, noteInternal, outcomeReason, assign }) {
  const { error } = await (await createClient()).rpc("staff_update_privacy_request", {
    p_id: id,
    p_to_status: status ?? null,
    p_note_requester: noteRequester ?? null,
    p_note_internal: noteInternal ?? null,
    p_outcome_reason: outcomeReason ?? null,
    p_assign: assign ?? null,
  });
  if (error) return privacyError(error);
  notifyRequester(id).catch(() => {});
  return ok({ message: "Saved." });
}

/** Tells the member there is an update, without putting the substance of the request in a notification or an email. */
export async function notifyRequester(requestId) {
  const db = createAdminClient();
  const { data: r } = await db.from("privacy_requests").select("reference, status, user_id, channel, contact_email").eq("id", requestId).maybeSingle();
  if (!r) return;
  if (r.user_id) {
    await db.rpc("notify", {
      p_user: r.user_id,
      p_type: "moderation_privacy_request",
      p_entity_type: "privacy_request",
      p_entity_id: requestId,
      p_data: { reference: r.reference, status: r.status },
      p_dedupe: `privacy:${requestId}:${r.status}`,
    });
  } else if (r.channel === "visitor" && r.contact_email) {
    const mail = privacyRequestEmail({
      heading: "There is an update on your grievance",
      reference: r.reference,
      lines: ["Open the tracking page and enter your reference and tracking code to read it."],
      cta: { label: "Track your grievance", url: `${publicEnv.appUrl}/grievance/track` },
    });
    await sendEmail({ to: r.contact_email, ...mail });
  }
}
