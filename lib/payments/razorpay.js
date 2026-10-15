import "server-only";
import { getEnv } from "@/lib/env";

/**
 * Razorpay REST client (server only). The key secret never leaves this module; the browser receives only the
 * public key id and an order id.
 *
 * Every call has a hard timeout, and a failure returns a short, safe message: provider errors can echo request
 * details, so they are logged on the server and never shown to the member.
 */

const API = "https://api.razorpay.com/v1";

export function paymentsConfigured() {
  const e = getEnv();
  return Boolean(e.RAZORPAY_KEY_ID && e.RAZORPAY_KEY_SECRET);
}

function authHeader() {
  const e = getEnv();
  return `Basic ${Buffer.from(`${e.RAZORPAY_KEY_ID}:${e.RAZORPAY_KEY_SECRET}`).toString("base64")}`;
}

async function call(method, path, body) {
  if (!paymentsConfigured()) return { ok: false, error: "Payments are not set up yet.", code: "payments_unconfigured" };
  try {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: { Authorization: authHeader(), "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      console.error("[razorpay]", method, path, res.status, json?.error?.code, json?.error?.description);
      // `providerMessage` is for administrator screens only; members get the generic `error`.
      return {
        ok: false,
        error: "The payment provider could not complete that. Please try again.",
        code: "provider_error",
        status: res.status,
        providerMessage: typeof json?.error?.description === "string" ? json.error.description.slice(0, 200) : null,
      };
    }
    return { ok: true, data: json };
  } catch (err) {
    console.error("[razorpay] request failed:", method, path, err?.name);
    return { ok: false, error: "The payment provider is not reachable right now. Please try again.", code: "provider_unreachable" };
  }
}

/** `receipt` is limited to 40 characters by the provider. */
export const createOrder = ({ amountPaise, receipt, notes }) =>
  call("POST", "/orders", { amount: amountPaise, currency: "INR", receipt: String(receipt).slice(0, 40), notes });

export const fetchPayment = (paymentId) => call("GET", `/payments/${encodeURIComponent(paymentId)}`);

export const capturePayment = (paymentId, amountPaise) =>
  call("POST", `/payments/${encodeURIComponent(paymentId)}/capture`, { amount: amountPaise, currency: "INR" });

/** Full refund of a payment. `notes` is searchable in the Razorpay dashboard. */
export const refundPayment = (paymentId, amountPaise, notes) =>
  call("POST", `/payments/${encodeURIComponent(paymentId)}/refund`, { amount: amountPaise, notes });
