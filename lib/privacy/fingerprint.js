// A hash of everything a person agrees to or is told: the purposes, the itemised data and the policy text.
// Used by the notice archive (migration 0043) and by tests/unit/privacy-registry.test.js, which fails if this content
// changes without a new version in NOTICE_VERSIONS. It uses a fixed, neutral contact so the value does not depend on
// which environment variables are set.
import { createHash } from "node:crypto";
import { DATA_CATEGORIES, MIN_AGE, PURPOSES } from "@/lib/privacy/registry";
import { getPolicySections } from "@/lib/privacy/policy-text";

export const NEUTRAL_CONTEXT = {
  email: "privacy@example.invalid",
  handler: "The privacy contact",
  entity: "",
  dpo: null,
  responseTarget: "14 days",
  maxDays: 90,
};

export function noticeContent(ctx = NEUTRAL_CONTEXT) {
  return { minAge: MIN_AGE, purposes: PURPOSES, data: DATA_CATEGORIES, policy: getPolicySections(ctx) };
}

export function noticeFingerprint() {
  return createHash("sha256").update(JSON.stringify(noticeContent())).digest("hex");
}
