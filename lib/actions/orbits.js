"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { fail, ok, parseInput } from "@/lib/actions/result";
import { enforceRateLimit } from "@/lib/rate-limit";
import * as orbits from "@/lib/services/orbits";

/**
 * Orbits entry points for signed-in members. Each validates its input and rate-limits, then calls a database function
 * that decides everything that matters (eligibility, amounts, idempotency). Nothing here can award an Orbit by itself.
 */

export async function claimCheckinAction() {
  const { user } = await requireProfile();
  const limited = await enforceRateLimit("orbit-checkin", user.id, { limit: 20, windowSec: 600 });
  if (limited) return limited;
  const res = await orbits.claimCheckin();
  if (res.ok) revalidatePath("/orbits");
  return res;
}

const answerSchema = z.object({ questionId: z.uuid(), selected: z.number().int().min(0).max(3) });
export async function submitAnswerAction(input) {
  const { user } = await requireProfile();
  const { data, failure } = parseInput(answerSchema, input);
  if (failure) return failure;
  const limited = await enforceRateLimit("orbit-answer", user.id, { limit: 30, windowSec: 600 });
  if (limited) return limited;
  const res = await orbits.submitAnswer(data.questionId, data.selected);
  if (res.ok) revalidatePath("/orbits", "layout");
  return res;
}

const boardSchema = z.object({ scope: z.enum(["global", "college", "connections"]), period: z.enum(["weekly", "monthly", "alltime"]), page: z.number().int().min(1).max(200).default(1) });
/** Used by the tabs on the overview page, so switching a board does not reload the page. */
export async function loadLeaderboardAction(input) {
  const { user } = await requireProfile();
  const { data, failure } = parseInput(boardSchema, input);
  if (failure) return failure;
  const limited = await enforceRateLimit("orbit-board", user.id, { limit: 60, windowSec: 60 });
  if (limited) return limited;
  const [rows, me] = await Promise.all([orbits.getLeaderboard({ ...data, limit: 5 }), orbits.getMyRank(data.scope, data.period)]);
  if (rows.error || me.error) return fail("Could not load the leaderboard. Please try again.");
  return ok({ data: { rows: rows.data, me: me.data } });
}

const privacySchema = z.object({
  showBalance: z.boolean(),
  showAchievements: z.boolean(),
  onLeaderboard: z.boolean(),
  cardsPublic: z.boolean(),
});
export async function updateOrbitPrivacyAction(input) {
  const { user } = await requireProfile();
  const { data, failure } = parseInput(privacySchema, input);
  if (failure) return failure;
  const { error } = await (await createClient())
    .from("profiles")
    .update({ orbits_show_balance: data.showBalance, orbits_show_achievements: data.showAchievements, orbits_on_leaderboard: data.onLeaderboard, orbits_cards_public: data.cardsPublic })
    .eq("id", user.id);
  if (error) return fail("Could not save your Orbits privacy choices.");
  revalidatePath("/", "layout");
  return ok({ message: "Orbits privacy saved." });
}
