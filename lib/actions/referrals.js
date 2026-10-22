"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireProfile } from "@/lib/auth/session";
import { fail, ok, parseInput } from "@/lib/actions/result";
import { enforceRateLimit } from "@/lib/rate-limit";
import * as referrals from "@/lib/services/referrals";

/**
 * Refer & Earn entry points for signed-in members. None of them can award, qualify or rank anything: the member's id comes from
 * the session, and the only thing a member can write is their own reminder preference.
 */

const eventSchema = z.object({ event: z.enum(["shown", "dismissed", "opt_out", "opt_in"]) });

/**
 * The reminder reports that it was shown, dismissed, or switched off. "shown" only starts the cooldown when the server agrees a
 * reminder was due, so `counted: false` tells the browser not to display it (another tab or device already did).
 */
export async function recordPromptEventAction(input) {
  const { user } = await requireProfile();
  const { data, failure } = parseInput(eventSchema, input);
  if (failure) return failure;
  const limited = await enforceRateLimit("referral-prompt", user.id, { limit: 30, windowSec: 600 });
  if (limited) return limited;
  const res = await referrals.recordPromptEvent(data.event);
  if (!res.ok) return res;
  if (data.event === "opt_out" || data.event === "opt_in") revalidatePath("/referrals");
  return ok({ counted: Boolean(res.data?.counted) });
}

export async function setPromptPreferenceAction(input) {
  const { data, failure } = parseInput(z.object({ optedOut: z.boolean() }), input);
  if (failure) return failure;
  const res = await recordPromptEventAction({ event: data.optedOut ? "opt_out" : "opt_in" });
  if (!res.ok) return res.code === "rate_limited" ? res : fail("Could not save that choice. Please try again.");
  return ok({ message: data.optedOut ? "Reminders are off." : "Reminders are on." });
}
