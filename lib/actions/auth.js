"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicEnv } from "@/lib/env-public";
import { HOME_PATH } from "@/lib/constants";
import { safeNext } from "@/lib/safe-redirect";
import { enforceRateLimit, getClientIp } from "@/lib/rate-limit";
import { getPublicSettings } from "@/lib/settings";
import { fail, ok, parseInput } from "@/lib/actions/result";
import { sendEmail } from "@/lib/email";
import { securityNoticeEmail } from "@/lib/email/templates";
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  emailSchema,
} from "@/lib/validators/auth";

const AUTH_LIMIT = { limit: 10, windowSec: 300 };

function mapAuthError(error) {
  switch (error?.code) {
    case "weak_password":
      return "That password is too weak. Use 8+ characters with upper and lower case letters and a number.";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "Too many emails requested. Please wait a few minutes and try again.";
    case "signup_disabled":
      return "New registrations are currently disabled.";
    case "email_address_invalid":
      return "That email address cannot be used.";
    default:
      return "We could not complete that request. Please try again.";
  }
}

export async function registerAction(input) {
  const { data, failure } = parseInput(registerSchema, input);
  if (failure) return failure;

  const ip = await getClientIp();
  const limited = await enforceRateLimit("register", ip, { limit: 8, windowSec: 3600 });
  if (limited) return limited;

  const settings = await getPublicSettings();
  if (!settings.registration_open) {
    return fail("Registration is currently closed. Please check back later.", { code: "registration_closed" });
  }

  const admin = createAdminClient();
  const { data: available } = await admin.rpc("username_available", { p_username: data.username });
  if (!available) {
    return fail("Please correct the highlighted fields.", {
      code: "validation",
      fieldErrors: { username: "That username is taken or unavailable" },
    });
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: data.email,
    password: data.password,
    options: {
      emailRedirectTo: `${publicEnv.appUrl}/auth/confirm?next=/onboarding`,
      data: { full_name: data.fullName, username: data.username },
    },
  });
  if (error) return fail(mapAuthError(error), { code: error.code });

  // The response is identical whether or not the address already has an account (no enumeration).
  return ok({ email: data.email });
}

export async function loginAction(input) {
  const { data, failure } = parseInput(loginSchema, input);
  if (failure) return failure;

  const ip = await getClientIp();
  const limited =
    (await enforceRateLimit("login-ip", ip, AUTH_LIMIT)) ||
    (await enforceRateLimit("login-email", data.email, { limit: 6, windowSec: 300 }));
  if (limited) return limited;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: data.email, password: data.password });
  if (error) {
    if (error.code === "email_not_confirmed") {
      return fail("Please confirm your email address first. We can send the link again.", {
        code: "email_not_confirmed",
      });
    }
    return fail("Invalid email or password.", { code: "invalid_credentials" });
  }

  redirect(safeNext(data.next, HOME_PATH));
}

export async function logoutAction() {
  const supabase = await createClient();
  // "local": end the session on THIS device only. The default (global) would sign the member out of their phone
  // and every other browser too. Signing out everywhere is an explicit choice in Settings > Security.
  await supabase.auth.signOut({ scope: "local" });
  redirect("/");
}

export async function forgotPasswordAction(input) {
  const { data, failure } = parseInput(forgotPasswordSchema, input);
  if (failure) return failure;

  const ip = await getClientIp();
  const limited =
    (await enforceRateLimit("forgot-ip", ip, { limit: 5, windowSec: 900 })) ||
    (await enforceRateLimit("forgot-email", data.email, { limit: 3, windowSec: 900 }));
  if (limited) return limited;

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(data.email, {
    redirectTo: `${publicEnv.appUrl}/auth/confirm?next=/reset-password`,
  });
  if (error && ["over_email_send_rate_limit", "over_request_rate_limit"].includes(error.code)) {
    return fail("Too many requests. Please wait a few minutes and try again.", { code: error.code });
  }
  // Same response whether or not the account exists.
  return ok({ message: "If an account exists for that email, a reset link is on its way." });
}

export async function resendVerificationAction(input) {
  const parsed = emailSchema.safeParse(input?.email);
  if (!parsed.success) return fail("Enter a valid email address.", { code: "validation" });

  const ip = await getClientIp();
  const limited =
    (await enforceRateLimit("resend-ip", ip, { limit: 6, windowSec: 900 })) ||
    (await enforceRateLimit("resend-email", parsed.data, { limit: 3, windowSec: 900 }));
  if (limited) return limited;

  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: parsed.data,
    options: { emailRedirectTo: `${publicEnv.appUrl}/auth/confirm?next=/onboarding` },
  });
  if (error && ["over_email_send_rate_limit", "over_request_rate_limit"].includes(error.code)) {
    return fail("Please wait a minute before requesting another email.", { code: error.code });
  }
  return ok({ message: "If that address is waiting for confirmation, we have sent a new link." });
}

/** Completes the password-recovery flow (the user arrived with a recovery session). */
export async function resetPasswordAction(input) {
  const { data, failure } = parseInput(resetPasswordSchema, input);
  if (failure) return failure;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return fail("This reset link has expired. Please request a new one.", { code: "no_session" });
  }

  const { error } = await supabase.auth.updateUser({ password: data.password });
  if (error) return fail(mapAuthError(error), { code: error.code });

  await supabase.auth.signOut({ scope: "global" });
  if (user.email) {
    const mail = securityNoticeEmail({
      name: user.user_metadata?.full_name || "there",
      title: "Your password was changed",
      detail: "Your UniSphere password was just changed and all sessions were signed out.",
    });
    sendEmail({ to: user.email, ...mail }).catch(() => {});
  }
  redirect("/login?reset=1");
}

/** Change password while signed in: re-verifies the current password first. */
export async function changePasswordAction(input) {
  const { data, failure } = parseInput(changePasswordSchema, input);
  if (failure) return failure;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return fail("Please sign in again.", { code: "no_session" });

  const limited = await enforceRateLimit("change-password", user.id, { limit: 5, windowSec: 900 });
  if (limited) return limited;

  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: data.currentPassword,
  });
  if (verifyError) {
    return fail("Please correct the highlighted fields.", {
      code: "validation",
      fieldErrors: { currentPassword: "Current password is incorrect" },
    });
  }

  const { error } = await supabase.auth.updateUser({ password: data.password });
  if (error) return fail(mapAuthError(error), { code: error.code });

  await supabase.auth.signOut({ scope: "others" });
  const mail = securityNoticeEmail({
    name: user.user_metadata?.full_name || "there",
    title: "Your password was changed",
    detail: "Your UniSphere password was just changed. Other devices were signed out.",
  });
  sendEmail({ to: user.email, ...mail }).catch(() => {});
  return ok({ message: "Password updated. Other devices have been signed out." });
}

export async function signOutOtherSessionsAction() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut({ scope: "others" });
  if (error) return fail("Could not sign out other sessions.");
  return ok({ message: "Signed out of all other devices." });
}
