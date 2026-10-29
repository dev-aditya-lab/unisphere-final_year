import "server-only";
import { randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fail, ok } from "@/lib/actions/result";
import { publicEnv } from "@/lib/env-public";
import { sealCheckout } from "@/lib/payments/checkout-token";
import { capturePayment, createOrder, getGateway, getOrderPayment, paymentsConfigured, paymentsStatus, refundPayment } from "@/lib/payments/gateway";
import { PAYMENT_CHECKOUT_PATH, PAYMENT_RETURN_PATH } from "@/lib/blue-tick";
import { ACADEMY_ERRORS } from "@/lib/academy/constants";
import { academyRpc, rpcFailure } from "@/lib/services/academy";

/**
 * Academy checkout, payment settlement and refunds. The payment gateway is the same adapter the blue tick uses (docs/PAYMENTS.md).
 *
 * Trust boundaries, in order:
 *   1. The amount is worked out by the database (academy_create_order -> the pricing engine) from the course, the cohort and the
 *      coupon CODE. The browser never sends an amount, a discount or a currency.
 *   2. A payment counts only after the gateway itself is asked about the order (or its webhook was authenticated by the adapter)
 *      and the database confirms the amount and currency equal what the order says. The page the student returns to is a pointer.
 *   3. The tables that hold money are written only by database functions the service role calls (academy_fulfil_order and friends),
 *      which are idempotent: the same payment arriving from the webhook and from the student coming back records once.
 */

/** The student pressed Pay. Creates the order, asks the gateway for a checkout, and answers where to send the browser. */
export async function startCheckout({ user, profile, courseId, cohortId, coupon, consent }) {
  const created = await academyRpc("academy_create_order", { p_course: courseId, p_cohort: cohortId, p_coupon: coupon, p_consent: consent === true, p_idem: null });
  if (!created.ok) return created;
  const o = created.data;
  if (o.enrolled) return ok({ enrolled: true, free: true });

  const admin = createAdminClient();
  const cancel = async () => admin.rpc("academy_cancel_order", { p_order: o.order_id, p_user: user.id });
  if (!paymentsConfigured()) {
    await cancel();
    return fail(ACADEMY_ERRORS.payments_unconfigured, { code: "payments_unconfigured" });
  }
  const { data: item } = await admin.from("academy_order_items").select("title, course_code").eq("order_id", o.order_id).limit(1).maybeSingle();
  const gateway = await createOrder({
    amountPaise: Number(o.total_minor),
    reference: `ac_${String(o.order_id).replace(/-/g, "")}`,
    description: `${item?.title ?? "UniSphere Academy"} (${item?.course_code ?? "course"})`.slice(0, 120),
    returnUrl: `${publicEnv.appUrl}${PAYMENT_RETURN_PATH}?o=${o.order_id}`,
    customer: { id: user.id, name: profile.full_name ?? "", email: user.email ?? "" },
    notes: { purpose: "academy", order: o.order_no },
  });
  if (!gateway.ok) {
    await cancel();
    return fail(gateway.error, { code: gateway.code });
  }
  const attached = await admin.rpc("academy_attach_provider_order", { p_order: o.order_id, p_provider: getGateway().id, p_provider_order: gateway.orderId });
  if (attached.error) {
    console.error("[academy] could not record the gateway order", attached.error.code);
    await cancel();
    return fail("Could not start the payment. Please try again.", { code: "db_error" });
  }
  const token = sealCheckout({ userId: user.id, checkout: gateway.checkout });
  return ok({ checkoutUrl: `${PAYMENT_CHECKOUT_PATH}?t=${token}`, orderNo: o.order_no });
}

const ORDER_COLUMNS = "id, user_id, status, provider, provider_order_id, total_minor, currency";
const SETTLED = new Set(["paid", "partially_refunded", "refunded"]);

/**
 * Ask the gateway what happened to an order and record it if paid. The one place an Academy payment is believed, whether the student
 * came back or the webhook arrived. Answers "done" | "duplicate" | "pending" | "failed" | "error" | "refunded".
 */
async function settleOrder(order) {
  if (order.status === "refunded") return "refunded";
  if (SETTLED.has(order.status)) return "done";
  if (!order.provider_order_id) return "pending";
  const found = await getOrderPayment(order.provider_order_id);
  if (!found.ok) return "error";
  let payment = found.payment;
  if (!payment || payment.status === "pending") return "pending";
  if (payment.status === "failed") return "failed";
  if (payment.orderId !== order.provider_order_id) {
    console.error("[academy] payment names a different gateway order");
    return "failed";
  }
  if (payment.status === "authorized") {
    const captured = await capturePayment({ paymentId: payment.id, amountPaise: Number(order.total_minor) });
    if (!captured.ok || captured.payment.status !== "paid") return "failed";
    payment = captured.payment;
  }
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("academy_fulfil_order", {
    p_provider: order.provider, p_provider_order: order.provider_order_id, p_provider_payment: payment.id,
    p_amount: payment.amountPaise, p_currency: payment.currency, p_method: payment.method ?? null,
  });
  if (error) {
    console.error("[academy] fulfil failed", error.code, String(error.message).slice(0, 80));
    return "error";
  }
  if (data?.ok === false) {
    console.error("[academy] payment rejected:", data.error);
    return "failed";
  }
  if (data?.duplicate) {
    // They already held this course: keep one enrolment and give the money back.
    const refund = await refundPayment({ paymentId: payment.id, amountPaise: payment.amountPaise, reason: "Duplicate purchase" });
    if (refund.ok) await admin.rpc("academy_record_gateway_refund", { p_provider: order.provider, p_provider_payment: payment.id });
    return "duplicate";
  }
  return "done";
}

/** Is this order ours? (`rowId` is our order id from the return link, `providerOrderId` the gateway's own id.) */
export async function findAcademyOrder({ rowId = null, providerOrderId = null }) {
  const admin = createAdminClient();
  let query = admin.from("academy_orders").select(ORDER_COLUMNS);
  if (rowId) query = query.eq("id", rowId);
  else if (providerOrderId) query = query.eq("provider_order_id", providerOrderId).eq("provider", getGateway()?.id ?? "");
  else return null;
  const { data: order } = await query.maybeSingle();
  return order ?? null;
}

/** The student came back from the gateway's page (or pressed "check again"). Returns { state, id }. */
export async function confirmAcademyReturn(order) {
  return { state: await settleOrder(order), id: order.id };
}

/** Does this normalized webhook event concern an Academy order or payment? */
export async function ownsAcademyEvent(event) {
  const admin = createAdminClient();
  if (event.type === "refund.done") {
    const { data } = await admin.from("academy_payments").select("id").eq("provider_payment_id", event.paymentId).maybeSingle();
    return Boolean(data);
  }
  const { data } = await admin.from("academy_orders").select("id").eq("provider_order_id", event.orderId).maybeSingle();
  return Boolean(data);
}

/** A webhook event that concerns an Academy order. Returns { ok } (false asks the gateway to retry). */
export async function handleAcademyWebhookEvent(event) {
  const admin = createAdminClient();
  if (event.type === "payment.paid") {
    const order = await findAcademyOrder({ providerOrderId: event.orderId });
    if (!order) return { ok: true, ignored: true };
    const state = await settleOrder(order);
    // "pending"/"error": the gateway does not (yet) agree it is paid, or could not be asked. Let it retry rather than trust the delivery.
    return { ok: state !== "pending" && state !== "error" };
  }
  if (event.type === "payment.failed") {
    await admin.rpc("academy_fail_order", { p_provider: getGateway()?.id ?? "", p_provider_order: event.orderId, p_reason: event.reason ?? "failed" });
    return { ok: true };
  }
  if (event.type === "refund.done") {
    const { error } = await admin.rpc("academy_record_gateway_refund", { p_provider: getGateway()?.id ?? "", p_provider_payment: event.paymentId });
    return { ok: !error };
  }
  return { ok: true, ignored: true };
}

// ── Staff: reconcile, refund ───────────────────────────────────────────────

/** Ask the gateway about an order that is not marked paid (pending, failed, expired) and record the truth. Finance staff only. */
export async function reconcileOrder({ orderId, actorId }) {
  const supabase = await createClient();
  const { data: allowed } = await supabase.rpc("has_permission", { p_permission: "academy.refunds.process", p_college_id: null });
  if (!allowed) return fail("You do not have permission to do that.", { code: "forbidden" });
  const order = await findAcademyOrder({ rowId: orderId });
  if (!order) return fail("That order no longer exists.", { code: "not_found" });
  const before = order.status;
  const state = await settleOrder(order);
  await createAdminClient().rpc("write_audit_log", { p_actor: actorId, p_action: "academy.order.reconciled", p_target_type: "academy_order", p_target_id: orderId, p_college: null, p_metadata: { before, result: state } });
  const message = { done: "The gateway confirms this order is paid; it is now recorded.", duplicate: "Paid twice; the second payment was refunded.", pending: "The gateway has no completed payment for this order yet.", failed: "The gateway reports the payment failed or does not match.", error: "The gateway could not be reached. Try again.", refunded: "This order is already refunded." }[state];
  return state === "error" ? fail(message, { code: "gateway_error" }) : ok({ state, message });
}

/** Send an APPROVED refund to the gateway. Only when the gateway accepts it is the order marked refunded. */
export async function processRefund({ refundId, actorId }) {
  const supabase = await createClient();
  const { data: rows, error } = await supabase.rpc("academy_refund_target", { p_refund: refundId });
  if (error) return rpcFailure(error);
  const target = rows?.[0];
  if (!target || target.status !== "approved" || !target.provider_payment_id) return fail("Only an approved refund can be sent to the gateway.", { code: "invalid_state" });
  const admin = createAdminClient();
  const sent = await refundPayment({ paymentId: target.provider_payment_id, amountPaise: Number(target.amount_minor), reason: target.reason });
  if (!sent.ok) {
    const label = paymentsStatus().label ?? "The payment gateway";
    await admin.rpc("academy_fail_refund", { p_refund: refundId, p_error: sent.providerMessage ?? sent.error ?? "refused" });
    return fail(`${label} did not accept the refund${sent.providerMessage ? `: ${sent.providerMessage}` : ""}. Nothing was changed; you can refund it in the gateway's dashboard instead.`, { code: sent.code });
  }
  const done = await admin.rpc("academy_complete_refund", { p_refund: refundId, p_provider_refund: null, p_actor: actorId });
  // The money has moved. If recording fails, the gateway's refund webhook reconciles it.
  if (done.error) console.error("[academy] refund sent but not recorded", done.error.code);
  return ok({ message: "Refunded through the gateway. The student was told." });
}

/** A short reference for log lines and idempotency keys. */
export const newKey = () => randomBytes(12).toString("hex");
