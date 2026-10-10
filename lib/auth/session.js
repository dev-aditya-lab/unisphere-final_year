import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safe-redirect";

/** Verified auth user (validated against the Auth server), memoised per request. */
export const getAuthUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ?? null;
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

/** Redirects to /login (preserving the destination) when not signed in. */
export async function requireUser() {
  const user = await getAuthUser();
  if (!user) {
    const next = safeNext(await currentPath(), "/");
    redirect(`/login?next=${encodeURIComponent(next)}`);
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
  if (!profile) redirect("/login?error=profile_missing");

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
