// When must a signed-in member be asked about their privacy choices, and may they carry on meanwhile?
// Pure functions (no I/O) so the rule is easy to test. The server reads the inputs: lib/privacy/gate-server.js.
//
// States:
//   ok               nothing to ask.
//   notice_updated   a newer notice exists but none of its changes need fresh consent: show a banner, ask nothing.
//   review_soft      an account from before the consent flow has no recorded consent yet: a banner, nothing is blocked.
//   review_required  the member must complete the review page first (accounts created after the cutover, or when the
//                    privacy team switched the mode to "required" because the Rules have come into force).
//   minor            the member declared they are under 18 and UniSphere does not offer accounts to under-18s.
// The pages that let a member delete their account, withdraw consent or read their data are never behind this gate.

import { NOTICE_VERSIONS, CURRENT_NOTICE } from "@/lib/privacy/registry";

const SAFE_PREFIXES = ["/privacy-review", "/delete-account", "/privacy-requests", "/settings", "/suspended", "/forbidden", "/auth", "/api"];

/** Pages that must stay reachable whatever the member's consent state is. */
export function isPrivacySafePath(path) {
  const p = String(path ?? "/").split("?")[0];
  return SAFE_PREFIXES.some((s) => p === s || p.startsWith(`${s}/`));
}

export const versionIndex = (version) => NOTICE_VERSIONS.findIndex((v) => v.version === version);

/** True when the notice has changed, since this consent was given, in a way that needs the member to confirm again. */
export function needsReconsent(consent, purpose) {
  if (!consent || consent.status !== "granted") return false;
  const given = versionIndex(consent.notice_version);
  for (let i = NOTICE_VERSIONS.length - 1; i > given && i >= 0; i--) {
    if (NOTICE_VERSIONS[i].reconsentPurposes.includes(purpose)) return true;
  }
  return false;
}

export function evaluateGate({ consents, createdAt, mode = "soft", cutoverAt = null, minorsPolicy = "adults_only" }) {
  if (!consents) return { state: "ok", missing: [] }; // consent tables unavailable: never lock anyone out because of a missing migration
  const age = consents.age_confirmation;
  const core = consents.core_service;

  if (age?.status === "declined" && minorsPolicy === "adults_only") return { state: "minor", missing: ["age_confirmation"] };

  const missing = [];
  if (age?.status !== "granted" || needsReconsent(age, "age_confirmation")) missing.push("age_confirmation");
  if (core?.status !== "granted" || needsReconsent(core, "core_service")) missing.push("core_service");

  if (missing.length) {
    const cutover = cutoverAt ? Date.parse(cutoverAt) : NaN;
    const after = Number.isFinite(cutover) && createdAt && Date.parse(createdAt) >= cutover;
    return { state: mode === "required" || after ? "review_required" : "review_soft", missing };
  }
  const latest = versionIndex(CURRENT_NOTICE.version);
  const seen = Math.min(versionIndex(core.notice_version), versionIndex(age.notice_version));
  if (seen >= 0 && seen < latest) return { state: "notice_updated", missing: [] };
  return { state: "ok", missing: [] };
}
