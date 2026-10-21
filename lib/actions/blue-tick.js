"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireProfile } from "@/lib/auth/session";
import { fail, ok, parseInput } from "@/lib/actions/result";
import { enforceRateLimit } from "@/lib/rate-limit";
import { rupeesToPaise } from "@/lib/blue-tick";
import { findUserByUsername } from "@/lib/services/admin";
import * as bt from "@/lib/services/blue-tick";
import { hasConsent } from "@/lib/privacy/consent";

/**
 * Blue tick Server Actions. Members: pay, confirm, send the ID document. Staff: review, price, free grants, refunds.
 * Staff actions only validate input here; the database function re-checks the permission for the signed-in caller.
 */

const id = z.uuid();
const reasonText = z.string().trim().min(3, "Please give a reason (at least 3 characters).").max(300);

// ── Member ──────────────────────────────────────────────────────────────────

export async function startBlueTickPurchaseAction() {
  const { user, profile } = await requireProfile();
  const limited = await enforceRateLimit("blue-tick-order", user.id, { limit: 8, windowSec: 3600 });
  if (limited) return limited;
  const res = await bt.startPurchase({ user, profile });
  if (!res.ok) return res;
  return ok({
    orderId: res.orderId,
    amountPaise: res.amountPaise,
    keyId: res.keyId,
    prefill: { name: profile.full_name, email: user.email ?? "" },
  });
}

const confirmSchema = z.object({
  orderId: z.string().regex(/^order_[A-Za-z0-9]{6,40}$/),
  paymentId: z.string().regex(/^pay_[A-Za-z0-9]{6,40}$/),
  signature: z.string().regex(/^[0-9a-fA-F]{64}$/),
});

export async function confirmBlueTickPaymentAction(input) {
  const { user } = await requireProfile();
  const { data, failure } = parseInput(confirmSchema, input);
  if (failure) return fail("We could not verify that payment.", { code: "invalid" });
  const limited = await enforceRateLimit("blue-tick-confirm", user.id, { limit: 20, windowSec: 3600 });
  if (limited) return limited;
  const res = await bt.confirmPayment({ user, ...data });
  if (res.ok) revalidatePath("/settings/blue-tick");
  return res;
}

export async function submitBlueTickDocumentAction(input) {
  const { user } = await requireProfile();
  const { data, failure } = parseInput(z.object({ applicationId: id, fileId: id }), input);
  if (failure) return failure;
  const limited = await enforceRateLimit("blue-tick-document", user.id, { limit: 10, windowSec: 3600 });
  if (limited) return limited;
  if (!(await hasConsent(user.id, "identity_verification"))) return fail("Please agree to the document review first.", { code: "consent_required" });
  const res = await bt.submitDocument({ user, applicationId: data.applicationId, fileId: data.fileId });
  if (res.ok) {
    revalidatePath("/settings/blue-tick");
    return ok({ message: "Sent. An administrator will review it." });
  }
  return res;
}

// ── Staff ───────────────────────────────────────────────────────────────────

async function staff(schema, input, run) {
  const { user } = await requireProfile();
  const { data, failure } = parseInput(schema, input);
  if (failure) return failure;
  const limited = await enforceRateLimit("blue-tick-admin", user.id, { limit: 120, windowSec: 3600 });
  if (limited) return limited;
  const res = await run(data, user);
  if (res.ok) revalidatePath("/admin", "layout");
  return res;
}

export const reviewBlueTickAction = async (input) =>
  staff(
    z.object({ id, decision: z.enum(["approve", "reject"]), reason: z.string().trim().max(500).optional() }),
    input,
    async (d) => {
      const res = await bt.reviewApplication(d);
      if (!res.ok) return res;
      return ok({ message: d.decision === "approve" ? "Approved. The blue tick is now on their profile." : "Sent back. They can upload a new document." });
    },
  );

export const refundBlueTickOrderAction = async (input) =>
  staff(z.object({ orderId: id, reason: reasonText }), input, (d, user) => bt.refundOrder({ orderId: d.orderId, actorId: user.id, reason: d.reason }));

export const setBlueTickPricingAction = async (input) =>
  staff(z.object({ enabled: z.boolean(), price: z.string().trim().max(12) }), input, async (d) => {
    const pricePaise = rupeesToPaise(d.price);
    if (pricePaise === null) return fail("Enter a price between ₹1 and ₹1,00,000 (up to two decimals).", { fieldErrors: { price: "Invalid price" } });
    const res = await bt.setPricing({ enabled: d.enabled, pricePaise });
    return res.ok ? ok({ message: d.enabled ? "Saved. The blue tick is on sale." : "Saved. The blue tick is not on sale." }) : res;
  });

export const grantBlueTickAction = async (input) =>
  staff(
    z.object({
      username: z.string().trim().toLowerCase().regex(/^[a-z0-9_-]{3,30}$/, "Enter an exact username."),
      reason: reasonText,
    }),
    input,
    async (d) => {
      const target = await findUserByUsername(d.username);
      if (!target) return fail("No member with that exact username was found.", { code: "not_found", fieldErrors: { username: "No such member." } });
      const res = await bt.setBlueTick({ userId: target.id, on: true, reason: d.reason });
      return res.ok ? ok({ message: `@${d.username} now has a blue tick.` }) : res;
    },
  );

export const revokeBlueTickAction = async (input) =>
  staff(z.object({ userId: id, reason: reasonText }), input, async (d) => {
    const res = await bt.setBlueTick({ userId: d.userId, on: false, reason: d.reason });
    return res.ok ? ok({ message: "The blue tick was removed." }) : res;
  });
