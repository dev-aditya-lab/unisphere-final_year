import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicEnv } from "@/lib/env-public";
import { sendEmail } from "@/lib/email";
import { accountExistsEmail, confirmEmailEmail, resetPasswordEmail } from "@/lib/email/templates";

/**
 * Account emails sent by UniSphere itself (Resend, our templates, our domain), not by Supabase Auth.
 *
 * Supabase is only asked for a one-time token: `auth.admin.generateLink` creates it without sending anything. We put
 * the token in a link to our own /auth/confirm route, which verifies it server-side and sets the session cookies.
 */

/** Our own confirm link for a Supabase token hash. */
export function confirmUrl({ tokenHash, type, next }) {
  const q = new URLSearchParams({ token_hash: tokenHash, type, next });
  return `${publicEnv.appUrl}/auth/confirm?${q.toString()}`;
}

/** "none" | "unconfirmed" | "confirmed" | "unknown" (the lookup function is not installed or failed). */
export async function authEmailState(email) {
  const { data, error } = await createAdminClient().rpc("auth_email_state", { p_email: email });
  if (error || typeof data !== "string") return "unknown";
  return data;
}

async function deliver(to, mail, key) {
  const res = await sendEmail({ to, ...mail, idempotencyKey: key });
  if (!res.ok) console.error("[auth-email] delivery failed:", res.reason, res.error);
  return res.ok;
}

/** Mint a fresh confirmation link for an existing, unconfirmed account and email it. Returns true if sent. */
export async function sendConfirmationFor(email, name) {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = data?.properties?.hashed_token;
  if (error || !tokenHash) return false;
  const url = confirmUrl({ tokenHash, type: "email", next: "/onboarding" });
  return deliver(email, confirmEmailEmail({ name, url }));
}

/** Sign-up: create the account unconfirmed and email the link. Handles an address that already exists. */
export async function startSignup({ email, password, fullName, username }) {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({
    type: "signup",
    email,
    password,
    options: { data: { full_name: fullName, username } },
  });

  if (!error && data?.properties?.hashed_token) {
    const url = confirmUrl({ tokenHash: data.properties.hashed_token, type: "signup", next: "/onboarding" });
    const sent = await deliver(email, confirmEmailEmail({ name: fullName, url }));
    return { ok: true, sent };
  }

  if (error?.code === "email_exists" || /already|registered|exists/i.test(error?.message ?? "")) {
    // Same response to the visitor either way. The mailbox owner learns what happened.
    const state = await authEmailState(email);
    if (state === "unconfirmed") await sendConfirmationFor(email, fullName);
    else await deliver(email, accountExistsEmail());
    return { ok: true, sent: true };
  }
  return { ok: false, error };
}

/** Password reset: only an existing account gets a link; the caller answers identically either way. */
export async function startPasswordReset(email) {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email });
  const tokenHash = data?.properties?.hashed_token;
  if (error || !tokenHash) return { sent: false };
  const url = confirmUrl({ tokenHash, type: "recovery", next: "/reset-password" });
  const name = data?.user?.user_metadata?.full_name;
  return { sent: await deliver(email, resetPasswordEmail({ name, url })) };
}

/** "Send it again": only for an account that is still waiting for confirmation. */
export async function resendConfirmation(email) {
  const state = await authEmailState(email);
  if (state !== "unconfirmed") return { sent: false };
  return { sent: await sendConfirmationFor(email, undefined) };
}
