import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { CURRENT_NOTICE, NOTICE_VERSION, PURPOSE_BY_KEY } from "@/lib/privacy/registry";
import { noticeContent, noticeFingerprint } from "@/lib/privacy/fingerprint";
import { getPolicySections } from "@/lib/privacy/policy-text";
import { privacyContact } from "@/lib/privacy/config";
import { fail, ok } from "@/lib/actions/result";

/**
 * Consent, server side. The browser never says who it is, which notice it saw or what it agreed to: the Server Action
 * knows the member from the session and the notice version from this code, and calls record_consent_for() (service
 * role only; migration 0043), which keeps the current choice and appends an event to the history.
 */

const published = new Set();

/** The policy text with this deployment's real contact details, for the archive. */
export function livePolicySections() {
  return getPolicySections({
    email: privacyContact.email,
    handler: privacyContact.name,
    entity: privacyContact.entity,
    dpo: privacyContact.dpo?.name ?? null,
    responseTarget: privacyContact.responseTarget,
    maxDays: privacyContact.grievanceMaxDays,
  });
}

/** Makes sure the version being shown exists in the immutable archive (idempotent; one call per process). */
export async function ensureNoticePublished(version = NOTICE_VERSION) {
  if (published.has(version)) return;
  if (version !== CURRENT_NOTICE.version) throw new Error(`Only the current notice (${CURRENT_NOTICE.version}) can be published from this build.`);
  const live = { ...noticeContent(), policy: livePolicySections() };
  const { error } = await createAdminClient().rpc("publish_privacy_notice", {
    p_version: CURRENT_NOTICE.version,
    p_effective_at: CURRENT_NOTICE.effectiveAt,
    p_hash: noticeFingerprint(),
    p_purposes: live.purposes,
    p_document: live,
    p_reconsent: CURRENT_NOTICE.reconsentPurposes,
    p_summary: CURRENT_NOTICE.summary,
  });
  if (error) throw new Error(`Could not record the privacy notice version: ${error.message}`);
  published.add(version);
}

const MESSAGES = {
  use_account_deletion: "Withdrawing this consent means leaving UniSphere. Use “Delete account” instead.",
  unknown_purpose: "That choice does not exist.",
  invalid_status: "That is not a valid choice.",
};

/**
 * @param {{ userId: string, purpose: string, status: 'granted'|'withdrawn'|'declined', source: string }} input
 */
export async function recordConsent({ userId, purpose, status, source }) {
  if (!PURPOSE_BY_KEY[purpose]) return fail(MESSAGES.unknown_purpose, { code: "unknown_purpose" });
  try {
    await ensureNoticePublished();
  } catch (err) {
    console.error("[consent] notice archive:", err.message);
    return fail("We could not save that choice. Please try again.", { code: "notice_unavailable" });
  }
  const { data, error } = await createAdminClient().rpc("record_consent_for", {
    p_user: userId,
    p_purpose: purpose,
    p_status: status,
    p_notice_version: NOTICE_VERSION,
    p_source: source,
  });
  if (error) {
    const code = Object.keys(MESSAGES).find((k) => error.message.includes(k));
    if (!code) console.error("[consent] record failed:", error.message);
    return fail(MESSAGES[code] ?? "We could not save that choice. Please try again.", { code: code ?? "db_error" });
  }
  return ok({ changed: data?.changed ?? true, status });
}

/** Does this member currently consent to this purpose? Fails closed: an error means "no". */
export async function hasConsent(userId, purpose) {
  if (!userId) return false;
  const { data, error } = await createAdminClient().rpc("has_consent", { p_user: userId, p_purpose: purpose });
  if (error) return false;
  return data === true;
}

/** { purpose: { status, notice_version, updated_at } } for one member, or null if the consent tables cannot be read. */
export async function readConsents(supabase, userId) {
  const { data, error } = await supabase.from("consent_current").select("purpose, status, notice_version, updated_at").eq("user_id", userId);
  if (error) return null;
  return Object.fromEntries((data ?? []).map((r) => [r.purpose, r]));
}

/** The member's own consent history, newest first (RLS limits it to their rows). */
export async function readConsentHistory(supabase, limit = 50) {
  const { data } = await supabase
    .from("consent_events")
    .select("id, purpose, status, notice_version, source, created_at")
    .order("id", { ascending: false })
    .limit(limit);
  return data ?? [];
}
