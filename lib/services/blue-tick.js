import "server-only";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dbError, fail, ok } from "@/lib/actions/result";
import { publicEnv } from "@/lib/env-public";
import { deleteObject } from "@/lib/storage/r2";
import { capturePayment, createOrder, getGateway, getOrderPayment, paymentsConfigured, paymentsStatus, refundPayment } from "@/lib/payments/gateway";
import { MIN_PRICE_PAISE, PAYMENT_RETURN_PATH } from "@/lib/blue-tick";
import { mutate, pageOffset, read, PAGE_SIZE } from "@/lib/services/admin";

/**
 * Blue tick: purchase, document submission, review, refund. The payment gateway is whichever adapter PAYMENT_GATEWAY names
 * (lib/payments/gateway.js); nothing here depends on which one.
 *
 * Trust boundaries, in order:
 *   1. The amount charged is read from platform settings on the SERVER when the order is created. The browser
 *      never supplies an amount, a currency or a user id.
 *   2. A payment only counts after the gateway itself is asked about the order (a server-to-server call, or a webhook the
 *      adapter authenticated) and the payment's order, amount and currency match the order we created. The page the member
 *      returns to carries an order reference and nothing else that is believed.
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
    // Open only when an administrator enabled it, set a real price, and a payment gateway is connected.
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

  // The order's id is made here, before the gateway is asked, so the page the member comes back to can name it. Each click on
  // "Pay" makes a fresh order; the per-member rate limit on the action keeps abandoned ones from piling up.
  const orderRowId = randomUUID();
  const created = await createOrder({
    amountPaise: config.pricePaise,
    reference: `bt_${orderRowId.replace(/-/g, "")}`,
    description: "UniSphere blue tick (one-time payment)",
    returnUrl: `${publicEnv.appUrl}${PAYMENT_RETURN_PATH}?o=${orderRowId}`,
    customer: { id: user.id, name: profile.full_name ?? "", email: user.email ?? "" },
    notes: { purpose: "blue_tick", user_id: user.id },
  });
  if (!created.ok) return fail(created.error, { code: created.code });

  const { error } = await createAdminClient().from("blue_tick_orders").insert({
    id: orderRowId,
    user_id: user.id,
    payer_username: profile.username,
    provider: getGateway().id,
    provider_order_id: created.orderId,
    amount_paise: config.pricePaise,
  });
  if (error) {
    console.error("[blue-tick] could not record order", error.code);
    return fail("Could not start the payment. Please try again.", { code: "db_error" });
  }
  return ok({ checkout: created.checkout, amountPaise: config.pricePaise });
}

/**
 * Turn a verified gateway payment into a paid order + an application awaiting the member's ID.
 * Safe to call twice (the return page and the webhook both arrive): the database function is idempotent.
 */
async function settlePayment({ orderId, payment }) {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("fulfil_blue_tick_order", {
    p_order: orderId,
    p_payment: payment.id,
    p_amount: payment.amountPaise,
    p_method: payment.method ?? null,
  });
  if (error) {
    console.error("[blue-tick] fulfil failed", error.code, String(error.message).slice(0, 80));
    return { ok: false, error };
  }
  if (data?.duplicate) {
    // A second payment for a tick they already hold or are applying for: give it back automatically.
    const refund = await refundPayment({ paymentId: payment.id, amountPaise: payment.amountPaise, reason: "Duplicate blue tick payment" });
    if (refund.ok) await admin.rpc("refund_blue_tick_order", { p_payment: payment.id, p_actor: null, p_note: "Duplicate payment, refunded automatically" });
    return { ok: true, duplicate: true, refunded: refund.ok };
  }
  return { ok: true, duplicate: false, applicationId: data?.application_id ?? null };
}

const ORDER_COLUMNS = "id, user_id, status, amount_paise, provider_order_id";

/**
 * Ask the gateway what happened to an order we created, and record it if the member paid. The one place a payment is
 * believed, whether the member came back to the site or the gateway called the webhook.
 * Answers where the order now stands: "done" | "duplicate" | "refunded" | "pending" | "failed" | "error".
 */
async function settleOrder(order) {
  if (order.status === "paid") return "done";
  if (order.status === "refunded") return "refunded";
  const found = await getOrderPayment(order.provider_order_id);
  if (!found.ok) return "error";
  let payment = found.payment;
  if (!payment || payment.status === "pending") return "pending";
  if (payment.status === "failed") return "failed";
  if (payment.orderId !== order.provider_order_id || payment.amountPaise !== order.amount_paise || payment.currency !== "INR") {
    console.error("[blue-tick] payment does not match order", order.provider_order_id.slice(0, 24));
    return "failed";
  }
  if (payment.status === "authorized") {
    const captured = await capturePayment({ paymentId: payment.id, amountPaise: order.amount_paise });
    if (!captured.ok || captured.payment.status !== "paid") return "failed";
    payment = captured.payment;
  }
  const settled = await settlePayment({ orderId: order.provider_order_id, payment });
  if (!settled.ok) return "error";
  return settled.duplicate ? "duplicate" : "done";
}

/**
 * The member has come back from the gateway's page (or pressed "check again"). `rowId` (our order id, from the return link) or
 * `providerOrderId` (the gateway's own id, when it posted that back instead) is only a reference to look the order up with:
 * what it says about payment is whatever the gateway reports, so nobody gains anything by passing someone else's, and no
 * session is needed (a gateway may send the member back with a POST, which carries no cookies).
 * Answers `{ state, id }`: where the order stands (see settleOrder, or "unknown") and our id for it.
 */
export async function confirmReturn({ rowId = null, providerOrderId = null }) {
  let query = createAdminClient().from("blue_tick_orders").select(ORDER_COLUMNS);
  if (rowId) query = query.eq("id", rowId);
  else if (providerOrderId) query = query.eq("provider_order_id", providerOrderId).eq("provider", getGateway()?.id ?? "");
  else return { state: "unknown", id: null };
  const { data: order } = await query.maybeSingle();
  if (!order) return { state: "unknown", id: null };
  return { state: await settleOrder(order), id: order.id };
}

/** A normalized event from the gateway's webhook (the safety net if the member never came back to the site). */
export async function handleWebhookEvent(event) {
  const admin = createAdminClient();

  if (event.type === "payment.paid") {
    const { data: order } = await admin.from("blue_tick_orders").select(ORDER_COLUMNS).eq("provider_order_id", event.orderId).maybeSingle();
    if (!order) return { ok: true, ignored: true }; // not one of ours
    // "pending" or "error" means the gateway does not (yet) agree it is paid, or could not be asked: let it retry rather than
    // trust the delivery alone. Every other answer is final, so retrying would change nothing.
    const state = await settleOrder(order);
    return { ok: state !== "pending" && state !== "error" };
  }
  if (event.type === "payment.failed") {
    await admin.rpc("fail_blue_tick_order", { p_order: event.orderId, p_note: event.reason ? `Failed: ${event.reason}` : "Failed" });
    return { ok: true };
  }
  if (event.type === "refund.done") {
    const { error } = await admin.rpc("refund_blue_tick_order", { p_payment: event.paymentId, p_actor: null, p_note: "Refunded in the payment gateway's dashboard" });
    if (error && !String(error.message).includes("not_found")) return { ok: false };
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

  const refund = await refundPayment({ paymentId: target.provider_payment_id, amountPaise: target.amount_paise, reason });
  if (!refund.ok) {
    const label = paymentsStatus().label ?? "The payment gateway";
    const why = refund.providerMessage ? `: ${refund.providerMessage}` : "";
    return fail(`${label} did not accept the refund${why}. Nothing was changed; you can also refund it in the gateway's own dashboard.`, { code: refund.code });
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

/**
 * The member withdrew the document-review consent: whatever document they uploaded is deleted, and an application that
 * was waiting for review goes back to waiting for a document. A tick already granted is not touched.
 */
export async function withdrawIdentityDocument(userId) {
  const admin = createAdminClient();
  const { data: apps } = await admin.from("blue_tick_applications").select("id, status, document_file_id").eq("user_id", userId).in("status", ["awaiting_document", "pending_review"]);
  for (const a of apps ?? []) {
    await discardDocument(a.document_file_id);
    if (a.status === "pending_review") {
      await admin.from("blue_tick_applications").update({ status: "awaiting_document", document_file_id: null, submitted_at: null }).eq("id", a.id);
    }
  }
}
