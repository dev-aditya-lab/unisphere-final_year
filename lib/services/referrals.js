import "server-only";
import { createHmac } from "node:crypto";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEnv } from "@/lib/env";
import { dbError, fail, ok } from "@/lib/actions/result";
import { normalizeRefCode } from "@/lib/referrals/core";

/**
 * Refer & Earn data access. Member reads and writes go through the signed-in member's own session, so the database functions
 * decide what they may see. The two calls that act for a visitor who has no session yet (attribution at sign-up, the invite
 * preview) use the service role and are reachable only from server code that has already validated its input.
 */

const ERRORS = {
  account_restricted: "Your account cannot use Refer & Earn right now.",
  invalid_scope: "Choose a valid leaderboard.",
  invalid_event: "That request is not valid.",
};

function rpcFail(error) {
  const msg = String(error?.message ?? "");
  for (const [k, text] of Object.entries(ERRORS)) if (msg.includes(k)) return fail(text, { code: k });
  return dbError(error, "Refer & Earn is unavailable right now. Please try again.");
}

/** Page read: { data } or { error: true } so a page can show a retry instead of a made-up number. */
export async function read(name, args = {}) {
  const { data, error } = await (await createClient()).rpc(name, args);
  if (error) {
    console.error(`[referrals] ${name} failed:`, error.message);
    return { error: true, data: null };
  }
  return { error: false, data };
}

export async function mutate(name, args = {}) {
  const { data, error } = await (await createClient()).rpc(name, args);
  return error ? rpcFail(error) : ok({ data });
}

/** Creates the member's code on first use. Memoised per request. */
export const getMyCode = cache(() => read("referral_my_code"));
export const getOverview = cache(() => read("referral_overview"));
export const getPromptCheck = cache(() => read("referral_prompt_check"));
export const getPromptPreference = () => read("referral_prompt_preference");

export const getReferralBoard = ({ period, page = 1, limit = 20 }) =>
  read("referral_leaderboard", { p_period: period, p_limit: limit, p_offset: (Math.max(1, Number(page) || 1) - 1) * limit });
export async function getMyReferralRank(period) {
  const res = await read("referral_my_rank", { p_period: period });
  return { error: res.error, data: res.data?.[0] ?? null };
}

export const recordPromptEvent = (event) => mutate("referral_prompt_record", { p_event: event });

// ── Visitors without a session (service role) ────────────────────────────────────────────────────────────────

/** A one-way, keyed hash of the sign-up address, used only to notice many sign-ups from one network. Never the address itself. */
export function networkHash(ip) {
  const env = getEnv();
  const key = env.APP_SECRET || env.SUPABASE_SECRET_KEY;
  if (!ip || ip === "unknown") return null;
  return createHmac("sha256", key).update(`referral-net:${ip}`).digest("hex").slice(0, 32);
}

let attributionDays = { value: 30, at: 0 };
/** How long an invite link is remembered (an administrator's setting), cached for a minute. */
export async function getAttributionDays() {
  if (Date.now() - attributionDays.at < 60_000) return attributionDays.value;
  const { data } = await createAdminClient().from("referral_settings").select("value").eq("key", "attribution_days").maybeSingle();
  const n = Number(data?.value);
  attributionDays = { value: Number.isInteger(n) && n >= 1 && n <= 90 ? n : 30, at: Date.now() };
  return attributionDays.value;
}

/** Whether an invite code can be used right now, and the inviter's display name for the sign-up page. */
export async function previewInvite(code) {
  const c = normalizeRefCode(code);
  if (!c) return { valid: false };
  const { data, error } = await createAdminClient().rpc("referral_preview", { p_code: c });
  if (error || !data?.valid) return { valid: false };
  return { valid: true, name: String(data.name ?? "").slice(0, 80) };
}

/**
 * Records who invited a brand-new account. Never throws and never blocks sign-up: a bad or expired code simply means no
 * referral (the reason is kept for abuse monitoring). Whether the person ever earns anyone a reward is decided later,
 * on the server, by the qualification rule.
 */
export async function attributeSignup({ userId, code, ip }) {
  const c = normalizeRefCode(code);
  if (!c || !userId) return { attributed: false, reason: "invalid_code" };
  try {
    const { data, error } = await createAdminClient().rpc("referral_attribute", { p_referred: userId, p_code: c, p_net_hash: networkHash(ip) });
    if (error) {
      console.error("[referrals] attribution failed:", error.message);
      return { attributed: false, reason: "error" };
    }
    return { attributed: Boolean(data?.attributed), reason: data?.reason ?? null };
  } catch (err) {
    console.error("[referrals] attribution failed:", err?.message);
    return { attributed: false, reason: "error" };
  }
}

// ── Worker tick ────────────────────────────────────────────────────────────────────────────────────────────

/** Expires referrals that ran out of time and drops stale abuse-signal data. */
export async function runReferralMaintenance() {
  const { data, error } = await createAdminClient().rpc("referral_maintenance");
  if (error) throw new Error(error.message);
  return data;
}

/** Sends the launch announcement (when an administrator has switched it on) to the next batch of members, in the app only. */
export async function deliverReferralCampaign({ limit = 500 } = {}) {
  const { data, error } = await createAdminClient().rpc("referral_campaign_deliver", { p_limit: limit });
  if (error) throw new Error(error.message);
  return data;
}
