"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireProfile } from "@/lib/auth/session";
import { parseInput, ok } from "@/lib/actions/result";
import { enforceRateLimit } from "@/lib/rate-limit";
import * as admin from "@/lib/services/admin";

/**
 * Refer & Earn administration. Thin, validated wrappers: the database functions check the permission (referrals.view /
 * referrals.manage) on every call, apply the rules, and write the audit entry, so a forged request fails there.
 */
const id = z.uuid();
const reason = z.string().trim().min(5, "Explain the decision (5+ characters).").max(500);

async function run(schema, input, fn, { limit = 60 } = {}) {
  const { user } = await requireProfile();
  const { data, failure } = parseInput(schema, input);
  if (failure) return failure;
  const limited = await enforceRateLimit("referral-admin", user.id, { limit, windowSec: 600 });
  if (limited) return limited;
  const res = await fn(data);
  if (res.ok) revalidatePath("/admin/referrals", "layout");
  return res;
}

export const reviewReferralAction = async (input) =>
  run(z.object({ id, decision: z.enum(["approve", "reject"]), reason }), input, async (d) => {
    const res = await admin.mutate("referral_admin_review", { p_id: d.id, p_decision: d.decision, p_reason: d.reason });
    return res.ok ? ok({ message: d.decision === "approve" ? "Approved. The reward was credited once." : "Rejected. No reward was paid." }) : res;
  }, { limit: 40 });

export const reverseReferralAction = async (input) =>
  run(z.object({ id, reason }), input, async (d) => {
    const res = await admin.mutate("referral_admin_reverse", { p_id: d.id, p_reason: d.reason });
    if (!res.ok) return res;
    const { taken, shortfall } = res.data;
    return ok({ message: shortfall > 0 ? `Reversed ${taken} Orbits. ${shortfall} could not be taken because the balance no longer held them.` : `Reversed ${taken} Orbits.` });
  }, { limit: 20 });

export const setReferralSettingAction = async (input) =>
  run(z.object({ key: z.string().max(40), value: z.union([z.boolean(), z.number().int().min(0).max(999), z.string().max(240)]) }), input, async (d) => {
    const res = await admin.mutate("referral_admin_set_setting", { p_key: d.key, p_value: d.value });
    return res.ok ? ok({ message: "Setting saved." }) : res;
  }, { limit: 40 });

export const stopReferralCampaignAction = async (input) =>
  run(z.object({ retract: z.boolean().default(false) }), input, async (d) => {
    const res = await admin.mutate("referral_admin_stop_campaign", { p_retract: d.retract });
    return res.ok ? ok({ message: d.retract ? `Announcement stopped. ${res.data.retracted} unread copies were removed.` : "Announcement stopped. Copies already delivered stay in people's bells." }) : res;
  }, { limit: 10 });
