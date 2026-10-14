import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safe-redirect";

/** Thrown when the auth server cannot be reached while a session exists. The member is NOT logged out. */
export class AuthUnavailableError extends Error {
  constructor() {
    super("The sign-in service could not be reached. Your session is intact; please try again.");
    this.name = "AuthUnavailableError";
  }
}

function userFromClaims(claims) {
  return {
    id: claims.sub,
    email: claims.email ?? null,
    phone: claims.phone ?? null,
    app_metadata: claims.app_metadata ?? {},
    user_metadata: claims.user_metadata ?? {},
    aud: claims.aud,
    role: claims.role,
  };
}

/**
 * The signed-in user, memoised per request.
 *
 * Fast path: the access token is a signed JWT that the proxy has just verified or refreshed, so its claims are checked
 * locally (no network round trip when the project signs with asymmetric keys). Every page used to pay a full round trip
 * to the Auth server here; on a host far from the database that was the single largest part of "the app feels slow".
 *
 * The trade-off: a session revoked elsewhere stays usable until its access token expires (at most an hour), while
 * account status (suspended, deactivated) is still checked against the database on every request. Anything that must
 * be strict (changing a password, exporting data) uses `getStrictAuthUser`.
 *
 * Returns null only when there is genuinely no valid session. If the auth server is unreachable and the claims cannot
 * be verified, this throws AuthUnavailableError so the error boundary asks the member to retry (never a silent logout).
 */
export const getAuthUser = cache(async () => {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;
  if (claims?.sub) return userFromClaims(claims);
  if (claimsError && isAuthRetryableFetchError(claimsError)) throw new AuthUnavailableError();

  // No usable claims: confirm with the Auth server (also covers projects that still use the legacy shared secret).
  const { data, error } = await supabase.auth.getUser();
  if (data?.user) return data.user;
  if (error && isAuthRetryableFetchError(error)) throw new AuthUnavailableError();
  return null;
});

/** The user as the Auth server sees them right now: revoked sessions and fresh account data. Costs a round trip. */
export const getStrictAuthUser = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (data?.user) return data.user;
  if (error && isAuthRetryableFetchError(error)) throw new AuthUnavailableError();
  return null;
});

/** The signed-in user's profile row (RLS: always readable by its owner). */
export const getCurrentProfile = cache(async () => {
  const user = await getAuthUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  return data ?? null;
});

async function currentPath() {
  const h = await headers();
  return h.get("x-pathname") || "/";
}

/** True when the browser sent a Supabase session cookie (valid or not). */
async function hasSessionCookie() {
  const store = await cookies();
  return store.getAll().some((c) => /^sb-.+-auth-token(\.\d+)?$/.test(c.name) && c.value);
}

/**
 * Where to send someone who has no usable session. If they still carry session cookies the server rejects
 * (revoked elsewhere), the cookies must be cleared first: see app/auth/session-ended/route.js.
 */
async function loginRedirect(next, extra = "") {
  const q = `next=${encodeURIComponent(next)}${extra}`;
  return (await hasSessionCookie()) ? `/auth/session-ended?${q}` : `/login?${q}`;
}

/** Redirects to /login (preserving the destination) when not signed in. */
export async function requireUser() {
  const user = await getAuthUser();
  if (!user) {
    const next = safeNext(await currentPath(), "/");
    redirect(await loginRedirect(next));
  }
  return user;
}

/**
 * Signed-in, profile present, account in good standing and onboarding finished.
 * Suspended / deactivated accounts are sent to /suspended; unfinished profiles to /onboarding.
 */
export async function requireProfile({ allowIncomplete = false } = {}) {
  const user = await requireUser();
  const profile = await getCurrentProfile();
  if (!profile) redirect(await loginRedirect("/", "&error=profile_missing"));

  if (profile.status === "suspended" || profile.status === "deactivated" || profile.status === "deleted") {
    redirect("/suspended");
  }
  if (!allowIncomplete && !profile.onboarded_at) {
    redirect("/onboarding");
  }
  return { user, profile };
}

/** Permissions the caller holds as [{ role, college_id, permission }]. */
export const getMyPermissions = cache(async () => {
  const user = await getAuthUser();
  if (!user) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_permissions");
  if (error) return [];
  return data ?? [];
});

export async function getMyRoles() {
  const perms = await getMyPermissions();
  const seen = new Map();
  for (const p of perms) {
    const key = `${p.role}:${p.college_id ?? "*"}`;
    if (!seen.has(key)) seen.set(key, { role: p.role, college_id: p.college_id });
  }
  return [...seen.values()];
}

/**
 * Server-side permission gate. `collegeId` scopes the check to a resource's college;
 * omit it to ask "do I hold this permission anywhere?" (navigation gating only).
 * The database re-checks the same permission in RLS / RPCs, so this is a UX guard
 * as well as a first line of defence — never the only one.
 */
export async function hasPermission(permission, collegeId = null) {
  const perms = await getMyPermissions();
  return perms.some(
    (p) => p.permission === permission && (collegeId === null ? true : p.college_id === null || p.college_id === collegeId),
  );
}

export async function requirePermission(permission, collegeId = null) {
  await requireProfile();
  if (!(await hasPermission(permission, collegeId))) {
    redirect("/forbidden");
  }
}
