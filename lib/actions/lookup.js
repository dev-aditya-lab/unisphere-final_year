"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { enforceRateLimit, getClientIp } from "@/lib/rate-limit";
import { usernameSchema } from "@/lib/validators/auth";

/** Live availability feedback for the sign-up / settings username fields. */
export async function checkUsernameAction(username) {
  const parsed = usernameSchema.safeParse(username);
  if (!parsed.success) {
    return { available: false, reason: parsed.error.issues[0]?.message ?? "Invalid username" };
  }
  const ip = await getClientIp();
  const limited = await enforceRateLimit("username-check", ip, { limit: 60, windowSec: 60 });
  if (limited) return { available: null, reason: "Slow down a little" };

  const { data, error } = await createAdminClient().rpc("username_available", { p_username: parsed.data });
  if (error) return { available: null, reason: "Could not check right now" };
  return { available: Boolean(data), reason: data ? null : "That username is taken or unavailable" };
}
