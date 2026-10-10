import "server-only";
import { headers } from "next/headers";
import { getMyPermissions } from "@/lib/auth/session";
import { getSetting } from "@/lib/settings";

/**
 * The "members only" gate. When the platform requires verification (the production default), a signed-in account
 * that is not a verified RGEC member, and holds no staff role, sees only the verification screen and its own
 * settings: no feed, no profiles, no projects. The database enforces the same rule (can_use_network), so this is
 * the friendly face of it, not the lock.
 */
export async function getMembershipGate(profile) {
  if ((await getSetting("college_verification_required")) !== true) return { blocked: false };
  if (profile.verification_status === "verified") return { blocked: false };
  if ((await getMyPermissions()).length > 0) return { blocked: false };
  return { blocked: true };
}

/** Pages a not-yet-verified member may still open: their own settings (profile, privacy, verification, security). */
export async function isGateExempt() {
  const path = (await headers()).get("x-pathname") ?? "";
  return path === "/settings" || path.startsWith("/settings/") || path.startsWith("/settings?");
}
