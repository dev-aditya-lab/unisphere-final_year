import "server-only";
import { getEnv } from "@/lib/env";
import { GATEWAYS } from "@/lib/payments/gateways";

/**
 * Payment gateways, behind one small contract, so the blue tick works with whichever gateway you have an account with.
 * Nothing outside lib/payments/gateways names a gateway; PAYMENT_GATEWAY picks the adapter (docs/PAYMENTS.md).
 *
 * How a purchase works, which is what the contract has to support:
 *   1. The server creates an order at the gateway for an amount IT chose, and gets back where to send the member
 *      (`checkout`: a hosted page to open, or a form to post to it). No gateway script ever runs on a UniSphere page.
 *   2. The member pays there and is sent back to `returnUrl` (/api/payments/return), and/or the gateway calls our webhook.
 *   3. Either way the server asks the gateway what really happened to that order (`getOrderPayment`) and only then records it.
 *      Nothing the browser says, and no query string on the way back, is believed.
 *
 * An adapter is a plain object. Its methods receive `cfg` (the generic PAYMENT_* settings) first and never throw for an
 * expected failure; they return `{ ok: false, error, code }` (see lib/payments/http.js for a helper that does this).
 *
 *   id                      lowercase [a-z0-9_-], stored on every order; this is the value of PAYMENT_GATEWAY
 *   label                   the name people see ("Stripe"), in the admin panel and the privacy notice
 *   isConfigured(cfg)       true when the credentials it needs are present
 *   webhookReady?(cfg)      true when it can authenticate webhooks (default: cfg.webhookSecret is set)
 *
 *   createOrder(cfg, { amountPaise, currency: "INR", reference, description, returnUrl, customer: { id, name, email }, notes })
 *       -> { ok: true, orderId, checkout }       checkout: { type: "redirect", url }
 *                                                       or { type: "form", action, method: "POST", fields: { name: value } }
 *   getOrderPayment(cfg, { orderId })
 *       -> { ok: true, payment }                 the successful payment for the order if there is one, else the latest
 *                                                attempt, else null (the member has not paid yet)
 *   capturePayment?(cfg, { paymentId, amountPaise })
 *       -> { ok: true, payment }                 only for gateways that authorise first; called when status is "authorized"
 *   refundPayment(cfg, { paymentId, amountPaise, reason })
 *       -> { ok: true }
 *   parseWebhook(cfg, { rawBody, headers })      verify the signature over the RAW body, then describe the event
 *       -> { ok: true, event }                   event: null (not interesting) or { type, orderId?, paymentId?, reason? }
 *       -> { ok: false, status: 401 | 400 }      bad signature | not parseable
 *
 *   payment = { id, orderId, amountPaise (integer), currency, status: "paid" | "authorized" | "pending" | "failed", method? }
 *   event.type = "payment.paid" (orderId) | "payment.failed" (orderId) | "refund.done" (paymentId)
 *
 * Whatever an adapter returns is re-checked here before the rest of the app sees it.
 */

const PAYMENT_STATUSES = new Set(["paid", "authorized", "pending", "failed"]);
const EVENT_TYPES = new Set(["payment.paid", "payment.failed", "refund.done"]);

const unconfigured = () => ({ ok: false, error: "Payments are not set up yet.", code: "payments_unconfigured" });
const providerFailed = () => ({ ok: false, error: "The payment provider could not complete that. Please try again.", code: "provider_error" });

/** The generic credentials, as every adapter receives them. */
export function paymentConfig() {
  const e = getEnv();
  return { keyId: e.PAYMENT_KEY_ID, keySecret: e.PAYMENT_KEY_SECRET, webhookSecret: e.PAYMENT_WEBHOOK_SECRET, baseUrl: e.PAYMENT_API_BASE_URL };
}

const wantedId = () => String(getEnv().PAYMENT_GATEWAY ?? "").trim().toLowerCase() || null;

/** The adapter PAYMENT_GATEWAY names, or null when none is chosen or the code has no adapter by that id. */
export function getGateway() {
  const id = wantedId();
  return id && Object.hasOwn(GATEWAYS, id) ? GATEWAYS[id] : null;
}

function attempt(fn) {
  try {
    return Boolean(fn());
  } catch {
    return false;
  }
}

/** What is connected right now, for the admin panel, the privacy notice and the "is the blue tick on sale" check. */
export function paymentsStatus() {
  const gateway = getGateway();
  const cfg = paymentConfig();
  const configured = Boolean(gateway) && attempt(() => gateway.isConfigured(cfg));
  const webhookReady = configured && attempt(() => (gateway.webhookReady ? gateway.webhookReady(cfg) : cfg.webhookSecret));
  return { wanted: wantedId(), id: gateway?.id ?? null, label: gateway?.label ?? null, adapterFound: Boolean(gateway), configured, webhookReady };
}

export const paymentsConfigured = () => paymentsStatus().configured;

/** Plain-language state for administrators: what is stopping sales (`blocking`) and what is merely incomplete (`warning`). */
export function describePaymentsStatus(status = paymentsStatus()) {
  if (!status.wanted) {
    return { blocking: "No payment gateway is connected yet. Set PAYMENT_GATEWAY and its keys on the server (see docs/PAYMENTS.md). Until then members cannot pay, even when this is switched on.", warning: null };
  }
  if (!status.adapterFound) {
    return { blocking: `PAYMENT_GATEWAY is "${status.wanted}", but the code has no adapter with that id. Add one in lib/payments/gateways (see docs/PAYMENTS.md). Until then members cannot pay.`, warning: null };
  }
  if (!status.configured) {
    return { blocking: `${status.label} is selected but its keys are not all set on the server (PAYMENT_KEY_ID, PAYMENT_KEY_SECRET and whatever else it needs), so members cannot pay even when this is switched on.`, warning: null };
  }
  if (!status.webhookReady) {
    return { blocking: null, warning: `${status.label} is connected, but the webhook is not set up (PAYMENT_WEBHOOK_SECRET). A payment is then only recorded when the member comes back to UniSphere, so one made right before closing the window can be missed.` };
  }
  return { blocking: null, warning: null };
}

// ── Checking what an adapter hands back ─────────────────────────────────────

// Printable ASCII, no spaces: every gateway's ids fit, and nothing odd gets into a URL, a log line or a database key.
const idOk = (v) => typeof v === "string" && /^[\x21-\x7e]{1,200}$/.test(v);

function httpsUrl(value) {
  if (typeof value !== "string" || value.length > 4096) return null;
  try {
    const u = new URL(value);
    const local = getEnv().NODE_ENV !== "production" && (u.hostname === "localhost" || u.hostname === "127.0.0.1");
    return u.protocol === "https:" || (local && u.protocol === "http:") ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Only an https page to open, or a small form to post to one, ever reaches the browser. */
function normalizeCheckout(c) {
  if (c?.type === "redirect") {
    const url = httpsUrl(c.url);
    return url ? { type: "redirect", url } : null;
  }
  if (c?.type === "form") {
    const action = httpsUrl(c.action);
    const entries = Object.entries(c.fields ?? {});
    const valid = entries.length <= 60 && entries.every(([k, v]) => k.length > 0 && k.length <= 100 && typeof v === "string" && v.length <= 4000);
    return action && valid ? { type: "form", action, method: c.method === "GET" ? "GET" : "POST", fields: Object.fromEntries(entries) } : null;
  }
  return null;
}

function normalizePayment(p) {
  if (!p || !idOk(p.id) || !idOk(p.orderId) || !Number.isInteger(p.amountPaise) || p.amountPaise < 0) return null;
  if (typeof p.currency !== "string" || !PAYMENT_STATUSES.has(p.status)) return null;
  return {
    id: p.id,
    orderId: p.orderId,
    amountPaise: p.amountPaise,
    currency: p.currency.toUpperCase(),
    status: p.status,
    method: typeof p.method === "string" ? p.method.slice(0, 40) : null,
  };
}

function normalizeEvent(e) {
  if (!e || !EVENT_TYPES.has(e.type)) return null;
  const orderId = idOk(e.orderId) ? e.orderId : null;
  const paymentId = idOk(e.paymentId) ? e.paymentId : null;
  if (e.type === "refund.done") return paymentId ? { type: e.type, paymentId } : null;
  return orderId ? { type: e.type, orderId, paymentId, reason: typeof e.reason === "string" ? e.reason.slice(0, 120) : null } : null;
}

/** Run one adapter method. A thrown error is a bug in the adapter: logged here, shown to nobody. */
async function call(method, input) {
  const gateway = getGateway();
  const cfg = paymentConfig();
  if (!gateway || !attempt(() => gateway.isConfigured(cfg))) return unconfigured();
  if (typeof gateway[method] !== "function") return { ok: false, error: "That is not supported by the payment gateway in use.", code: "unsupported" };
  try {
    const res = await gateway[method](cfg, input);
    return res && typeof res === "object" ? res : providerFailed();
  } catch (err) {
    console.error(`[payments:${gateway.id}]`, method, "threw:", err?.name, String(err?.message ?? "").slice(0, 120));
    return providerFailed();
  }
}

// ── What the rest of the app calls ──────────────────────────────────────────

export async function createOrder({ amountPaise, reference, description, returnUrl, customer, notes }) {
  const res = await call("createOrder", { amountPaise, currency: "INR", reference, description, returnUrl, customer, notes });
  if (!res.ok) return res;
  const checkout = normalizeCheckout(res.checkout);
  if (!idOk(res.orderId) || !checkout) {
    console.error("[payments] createOrder returned something unusable");
    return providerFailed();
  }
  return { ok: true, orderId: res.orderId, checkout };
}

/** `payment` is null when the member has not paid (yet). */
export async function getOrderPayment(orderId) {
  const res = await call("getOrderPayment", { orderId });
  if (!res.ok) return res;
  if (res.payment == null) return { ok: true, payment: null };
  const payment = normalizePayment(res.payment);
  if (!payment) {
    console.error("[payments] getOrderPayment returned something unusable");
    return providerFailed();
  }
  return { ok: true, payment };
}

export async function capturePayment({ paymentId, amountPaise }) {
  const res = await call("capturePayment", { paymentId, amountPaise });
  if (!res.ok) return res;
  const payment = normalizePayment(res.payment);
  return payment ? { ok: true, payment } : providerFailed();
}

export async function refundPayment({ paymentId, amountPaise, reason }) {
  const res = await call("refundPayment", { paymentId, amountPaise, reason: String(reason ?? "").slice(0, 200) });
  return res.ok ? { ok: true } : { ok: false, error: res.error ?? providerFailed().error, code: res.code ?? "provider_error", providerMessage: res.providerMessage ?? null };
}

/**
 * Authenticate and read a webhook delivery. Answers `{ ok: false, status }` for a request that must be refused:
 * 503 nothing to verify against, 401 bad signature, 400 unreadable, 500 the adapter failed (the gateway should retry).
 */
export async function parseWebhook({ rawBody, headers }) {
  const gateway = getGateway();
  const cfg = paymentConfig();
  if (!gateway || !paymentsStatus().webhookReady) return { ok: false, status: 503, code: "not_configured" };
  try {
    const res = await gateway.parseWebhook(cfg, { rawBody, headers });
    if (!res?.ok) return { ok: false, status: res?.status === 400 ? 400 : 401, code: res?.status === 400 ? "invalid_payload" : "invalid_signature" };
    return { ok: true, event: normalizeEvent(res.event) };
  } catch (err) {
    console.error(`[payments:${gateway.id}] parseWebhook threw:`, err?.name, String(err?.message ?? "").slice(0, 120));
    return { ok: false, status: 500, code: "error" };
  }
}
