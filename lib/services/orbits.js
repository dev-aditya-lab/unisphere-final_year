import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { dbError, fail, ok } from "@/lib/actions/result";

/**
 * Orbits data access. Everything goes through the signed-in member's own session: the database functions decide what
 * they may see (their own ledger, the leaderboard scope they belong to, profiles they may view), never this file.
 */

export const LEDGER_PAGE = 15;

const ERRORS = {
  account_restricted: "Your account cannot earn Orbits right now.",
  invalid_answer: "Choose one of the four answers.",
  question_not_available: "That question is no longer open. Reload to see today's challenge.",
  invalid_scope: "Choose a valid leaderboard.",
};

function rpcFail(error) {
  const msg = String(error?.message ?? "");
  for (const [k, text] of Object.entries(ERRORS)) if (msg.includes(k)) return fail(text, { code: k });
  return dbError(error, "Orbits is unavailable right now. Please try again.");
}

async function call(name, args = {}) {
  const { data, error } = await (await createClient()).rpc(name, args);
  return error ? { error } : { data };
}

/** Page read: returns { data } or { error: true } so a page can show a retry instead of a fake number. */
export async function read(name, args = {}) {
  const res = await call(name, args);
  if (res.error) {
    console.error(`[orbits] ${name} failed:`, res.error.message);
    return { error: true, data: null };
  }
  return { error: false, data: res.data };
}

export async function mutate(name, args = {}) {
  const res = await call(name, args);
  return res.error ? rpcFail(res.error) : ok({ data: res.data });
}

export const getOverview = cache(() => read("orbit_overview"));
/** The lean read behind the header pill, the feed widget and the mobile strip. Memoised per request so they share one query. */
export const getGlance = cache(() => read("orbit_glance"));
export const getDailyQuestion = () => read("orbit_daily_question");
export const getAchievements = () => read("orbit_my_achievements");
export const getProfileSummary = (username) => read("orbit_profile_summary", { p_username: username });
export const getLeaderboard = ({ scope, period, page = 1, limit = 20 }) =>
  read("orbit_leaderboard", { p_scope: scope, p_period: period, p_limit: limit, p_offset: (Math.max(1, Number(page) || 1) - 1) * limit });
export const getMyRank = async (scope, period) => {
  const res = await read("orbit_my_rank", { p_scope: scope, p_period: period });
  return { error: res.error, data: res.data?.[0] ?? null };
};
export const getLearningHistory = ({ page = 1, limit = 10 }) => read("orbit_my_history", { p_limit: limit, p_offset: (Math.max(1, Number(page) || 1) - 1) * limit });

/** The member's own ledger, newest first, one extra row to learn whether there is a next page. */
export async function getLedgerPage({ page = 1 }) {
  const from = (Math.max(1, Number(page) || 1) - 1) * LEDGER_PAGE;
  const { data, error } = await (await createClient())
    .from("orbit_ledger")
    .select("id, kind, amount, day, reason, created_at")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, from + LEDGER_PAGE);
  if (error) {
    console.error("[orbits] ledger failed:", error.message);
    return { error: true, rows: [], hasMore: false };
  }
  return { error: false, rows: data.slice(0, LEDGER_PAGE), hasMore: data.length > LEDGER_PAGE };
}

/** Marks the member's unacknowledged badges as seen and returns them, atomically: a badge is celebrated once. */
export const takeCelebrations = () => mutate("orbit_take_celebrations");
export const claimCheckin = () => mutate("orbit_claim_checkin");
export const submitAnswer = (questionId, selected) => mutate("orbit_submit_answer", { p_question: questionId, p_selected: selected });
