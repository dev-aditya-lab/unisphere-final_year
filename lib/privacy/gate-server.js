import "server-only";
import { getSetting } from "@/lib/settings";
import { evaluateGate } from "@/lib/privacy/gate";

/** The gate for one signed-in member, using the platform's privacy settings (all private, server-read). */
export async function gateFor(profile) {
  const [mode, cutoverAt, minorsPolicy] = await Promise.all([
    getSetting("privacy_review_mode"),
    getSetting("privacy_cutover_at"),
    getSetting("privacy_minors_policy"),
  ]);
  return evaluateGate({
    consents: profile?.consents ?? null,
    createdAt: profile?.created_at,
    mode: mode === "required" ? "required" : "soft",
    cutoverAt: typeof cutoverAt === "string" ? cutoverAt : null,
    minorsPolicy: minorsPolicy ?? "adults_only",
  });
}
