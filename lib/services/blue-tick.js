import "server-only";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dbError, fail, ok } from "@/lib/actions/result";
import { getEnv } from "@/lib/env";
import { deleteObject } from "@/lib/storage/r2";
import { capturePayment, createOrder, fetchPayment, paymentsConfigured, refundPayment } from "@/lib/payments/razorpay";
import { verifyCheckoutSignature } from "@/lib/payments/signature";
import { MIN_PRICE_PAISE } from "@/lib/blue-tick";
import { mutate, pageOffset, read, PAGE_SIZE } from "@/lib/services/admin";

/**
 * Blue tick: purchase, document submission, review, refund.
 *
 * Trust boundaries, in order:
 *   1. The amount charged is read from platform settings on the SERVER when the order is created. The browser
 *      never supplies an amount, a currency or a user id.
 *   2. A payment only counts after (a) Razorpay's signature over `order_id|payment_id` verifies, and (b) the payment
 *      is read back from Razorpay's API and its order, amount and currency match the order we created.
 *   3. Payment rows are written only here, with the service role. Review decisions and free grants go through
 *      database functions that check the staff permission themselves.
 */

const SETTING_KEYS = ["blue_tick_enabled", "blue_tick_price_paise"];

/** Public settings: whether purchases are open and the one-time price in paise. */
export async function getBlueTickConfig() {
  const { data } = await createAdminClient().from("system_settings").select("key, value").in("key", SETTING_KEYS);
  const by = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
  const pricePaise = Number(by.blue_tick_price_paise) || 0;
  const enabled = by.blue_tick_enabled === true;
  const configured = paymentsConfigured();
  return {
    enabled,
    pricePaise,
    configured,
    // Open only when an administrator enabled it, set a real price, and the provider keys are present.
    open: enabled && configured && pricePaise >= MIN_PRICE_PAISE,
  };
}

/** What the signed-in member sees on their blue tick page. */
export async function getMemberBlueTick(userId) {
  const supabase = await createClient();
  const { data: application } = await supabase
    .from("blue_tick_applications")
    .select("id, status, attempts, rejection_reason, submitted_at, created_at, order_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  let order = null;
  if (application?.order_id) {
    const { data } = await supabase
      .from("blue_tick_orders")
      .select("amount_paise, paid_at, status")
      .eq("id", application.order_id)
      .maybeSingle();
    order = data;
  }
  return { application: application ?? null, order };
}

// ── Purchase ────────────────────────────────────────────────────────────────

export async function startPurchase({ user, profile }) {
  const config = await getBlueTickConfig();
  if (!config.configured) return fail("Payments are not set up yet.", { code: "payments_unconfigured" });
  if (!config.open) return fail("The blue tick is not on sale right now.", { code: "not_open" });
  if (profile.blue_tick) return fail("You already have the blue tick.", { code: "already_has_tick" });

  const supabase = await createClient();
  const { data: open } = await supabase
    .from("blue_tick_applications")
    .select("id, status")
    .eq("user_id", user.id)
    .in("status", ["awaiting_document", "pending_review"])
    .maybeSingle();
  if (open) return fail("You have already paid. Send your ID for review to finish.", { code: "already_paid" });

  // Clicking "Pay" again within half an hour reuses the order that is already open (same member, same price), so
  // closing and reopening the payment window does not pile up orders.
  const admin = createAdminClient();
  const { data: reusable } = await admin
    .from("blue_tick_orders")
    .select("provider_order_id")
    .eq("user_id", user.id)
    .eq("status", "created")
    .eq("amount_paise", config.pricePaise)
    .gt("created_at", new Date(Date.now() - 30 * 60_000).toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (reusable) return ok({ orderId: reusable.provider_order_id, amountPaise: config.pricePaise, keyId: getEnv().RAZORPAY_KEY_ID });

  const created = await createOrder({
    amountPaise: config.pricePaise,
    receipt: `bt_${randomUUID().replace(/-/g, "").slice(0, 30)}`,
    notes: { purpose: "blue_tick", user_id: user.id },
  });
  if (!created.ok) return fail(created.error, { code: created.code });
  const order = created.data;

  const { error } = await admin.from("blue_tick_orders").insert({
    user_id: user.id,
    payer_username: profile.username,
    provider_order_id: order.id,
    amount_paise: config.pricePaise,
  });
  if (error) {
    console.error("[blue-tick] could not record order", error.code);
    return fail("Could not start the payment. Please try again.", { code: "db_error" });
  }
  return ok({
    orderId: order.id,
    amountPaise: config.pricePaise,
    keyId: getEnv().RAZORPAY_KEY_ID,
  });
}

/**
 * Turn a verified provider payment into a paid order + an application awaiting the member's ID.
 * Safe to call twice (browser confirmation and webhook both arrive): the database function is idempotent.
 */
async function settlePayment({ orderId, payment }) {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("fulfil_blue_tick_order", {
    p_order: orderId,
    p_payment: payment.id,
    p_amount: payment.amount,
    p_method: payment.method ?? null,
  });
  if (error) {
    console.error("[blue-tick] fulfil failed", error.code, String(error.message).slice(0, 80));
    return { ok: false, error };
  }
  if (data?.duplicate) {
    // A second payment for a tick they already hold or are applying for: give it back automatically.
    const refund = await refundPayment(payment.id, payment.amount, { reason: "Duplicate blue tick payment" });
    if (refund.ok) await admin.rpc("refund_blue_tick_order", { p_payment: payment.id, p_actor: null, p_note: "Duplicate payment, refunded automatically" });
    return { ok: true, duplicate: true, refunded: refund.ok };
  }
  return { ok: true, duplicate: false, applicationId: data?.application_id ?? null };
}

/** Browser reports a finished checkout. Nothing in the request is trusted until it is checked here. */
export async function confirmPayment({ user, orderId, paymentId, signature }) {
  const secret = getEnv().RAZORPAY_KEY_SECRET;
  if (!verifyCheckoutSignature({ orderId, paymentId, signature, secret })) {
    console.error("[blue-tick] invalid checkout signature for order", String(orderId).slice(0, 24));
    return fail("We could not verify that payment.", { code: "invalid_signature" });
  }
  const admin = createAdminClient();
  const { data: order } = await admin
    .from("blue_tick_orders")
    .select("id, user_id, status, amount_paise")
    .eq("provider_order_id", orderId)
    .maybeSingle();
  // Same answer for "no such order" and "someone else's order".
  if (!order || order.user_id !== user.id) return fail("We could not find that payment.", { code: "not_found" });
  if (order.status === "paid" || order.status === "refunded") return ok({ alreadyDone: true });

  const fetched = await fetchPayment(paymentId);
  if (!fetched.ok) return fail("We could not confirm the payment yet. If you were charged, it will appear here shortly.", { code: "provider_error" });
  let payment = fetched.data;
  if (payment.order_id !== orderId || Number(payment.amount) !== order.amount_paise || payment.currency !== "INR") {
    console.error("[blue-tick] payment does not match order", orderId);
    return fail("We could not verify that payment.", { code: "mismatch" });
  }
  if (payment.status === "authorized") {
    const captured = await capturePayment(paymentId, order.amount_paise);
    if (!captured.ok) return fail("The payment was not completed. You have not been charged.", { code: "capture_failed" });
    payment = captured.data;
  }
  if (payment.status !== "captured") return fail("The payment was not completed. You have not been charged.", { code: "not_captured" });

  const settled = await settlePayment({ orderId, payment });
  if (!settled.ok) return fail("Your payment was received but could not be recorded yet. It will be applied automatically; contact support if it is not within an hour.", { code: "db_error" });
  if (settled.duplicate) return fail("You already had a blue tick in progress, so this second payment was refunded.", { code: "duplicate" });
  return ok({ applicationId: settled.applicationId });
}

/** Razorpay webhook events (the safety net if the browser closed before confirming). */
export async function handleWebhookEvent(event) {
  const admin = createAdminClient();
  const type = event?.event;
  const payment = event?.payload?.payment?.entity;

  if ((type === "payment.captured" || type === "order.paid") && payment?.order_id) {
    const { data: order } = await admin.from("blue_tick_orders").select("amount_paise").eq("provider_order_id", payment.order_id).maybeSingle();
    if (!order) return { ok: true, ignored: true }; // not one of ours
    if (payment.status !== "captured" || payment.currency !== "INR" || Number(payment.amount) !== order.amount_paise) return { ok: false };
    const settled = await settlePayment({ orderId: payment.order_id, payment });
    return { ok: settled.ok };
  }
  if (type === "payment.failed" && payment?.order_id) {
    await admin.rpc("fail_blue_tick_order", { p_order: payment.order_id, p_note: payment.error_code ? `Failed: ${payment.error_code}` : "Failed" });
    return { ok: true };
  }
  if (type === "refund.processed" || type === "refund.created") {
    const refund = event?.payload?.refund?.entity;
    if (refund?.payment_id && type === "refund.processed") {
      const { error } = await admin.rpc("refund_blue_tick_order", { p_payment: refund.payment_id, p_actor: null, p_note: "Refunded in the payment provider's dashboard" });
      if (error && !String(error.message).includes("not_found")) return { ok: false };
    }
    return { ok: true };
  }
  return { ok: true, ignored: true };
}

// ── The member's ID document ────────────────────────────────────────────────

export async function submitDocument({ user, applicationId, fileId }) {
  const { error } = await (await createClient()).rpc("submit_blue_tick_document", { p_application: applicationId, p_file: fileId });
  if (error) {
    const msg = String(error.message ?? "");
    if (msg.includes("invalid_state")) return fail("This application is not waiting for a document.", { code: "invalid_state" });
    if (msg.includes("invalid_document")) return fail("That document could not be used. Please upload it again.", { code: "invalid_document" });
    if (msg.includes("not_found")) return fail("We could not find your application.", { code: "not_found" });
    return dbError(error);
  }
  return ok();
}

/** Remove a stored ID document once a decision exists. The decision is kept; the document is not. */
export async function discardDocument(fileId) {
  if (!fileId) return;
  const admin = createAdminClient();
  const { data: file } = await admin.from("files").select("id, bucket, storage_key, status").eq("id", fileId).maybeSingle();
  if (!file || file.status === "deleted") return;
  try {
    await deleteObject({ visibility: file.bucket, key: file.storage_key });
  } catch (err) {
    console.error("[blue-tick] could not delete document object", err?.message);
    return; // leave the row alone so the cleanup job can retry
  }
  await admin.from("files").update({ status: "deleted", deleted_at: new Date().toISOString() }).eq("id", file.id);
}

// ── Administrator ───────────────────────────────────────────────────────────

export const getPaymentsOverview = (days = 30) => read("admin_payments_overview", { p_days: days });
export const listOrders = ({ status = null, page = 1 } = {}) =>
  read("admin_list_blue_tick_orders", { p_status: status, p_limit: PAGE_SIZE, p_offset: pageOffset(page) });
export const listApplications = ({ status = "pending_review", page = 1 } = {}) =>
  read("admin_list_blue_tick_applications", { p_status: status, p_limit: PAGE_SIZE, p_offset: pageOffset(page) });
export const listBlueTicks = ({ page = 1 } = {}) => read("admin_list_blue_ticks", { p_limit: PAGE_SIZE, p_offset: pageOffset(page) });

export async function reviewApplication({ id, decision, reason }) {
  const res = await mutate("review_blue_tick_application", { p_id: id, p_decision: decision, p_reason: reason ?? null });
  if (res.ok) await discardDocument(res.data?.document_file_id);
  return res;
}

export const setBlueTick = ({ userId, on, reason }) => mutate("admin_set_blue_tick", { p_user: userId, p_on: on, p_reason: reason });
export const setPricing = ({ enabled, pricePaise }) => mutate("set_blue_tick_pricing", { p_enabled: enabled, p_price_paise: pricePaise });

/** Refund a payment through the provider, then record it. The permission is checked by the database first. */
export async function refundOrder({ orderId, actorId, reason }) {
  const { data, error } = await (await createClient()).rpc("blue_tick_refund_target", { p_order: orderId });
  if (error) {
    const msg = String(error.message ?? "");
    if (msg.includes("forbidden")) return fail("You do not have permission to do that.", { code: "forbidden" });
    if (msg.includes("not_found")) return fail("That order no longer exists.", { code: "not_found" });
    return dbError(error);
  }
  const target = Array.isArray(data) ? data[0] : data;
  if (!target?.provider_payment_id || target.status !== "paid") return fail("Only a paid order can be refunded.", { code: "invalid_state" });

  // An application still waiting for review holds an ID document; it is deleted along with the refund.
  const admin = createAdminClient();
  const { data: app } = await admin.from("blue_tick_applications").select("document_file_id").eq("order_id", orderId).maybeSingle();

  const refund = await refundPayment(target.provider_payment_id, target.amount_paise, { reason: String(reason).slice(0, 200) });
  if (!refund.ok) {
    const why = refund.providerMessage ? `: ${refund.providerMessage}` : "";
    return fail(`Razorpay did not accept the refund${why}. Nothing was changed; you can also refund it in the Razorpay dashboard.`, { code: refund.code });
  }
  const { error: recordError } = await admin.rpc("refund_blue_tick_order", {
    p_payment: target.provider_payment_id,
    p_actor: actorId,
    p_note: String(reason).slice(0, 300),
  });
  // The money has moved. If recording fails, the provider's refund webhook reconciles it.
  if (recordError) console.error("[blue-tick] refund issued but not recorded", recordError.code);
  await discardDocument(app?.document_file_id);
  return ok({ message: "Refunded. The tick (if any) was removed." });
}
