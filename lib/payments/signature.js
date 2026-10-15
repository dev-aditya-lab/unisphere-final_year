import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Razorpay signatures, kept free of I/O so they can be tested on their own.
 *   - Checkout:  HMAC_SHA256(`${order_id}|${payment_id}`, key_secret)  against `razorpay_signature`.
 *   - Webhook:   HMAC_SHA256(raw request body, webhook_secret)         against the `x-razorpay-signature` header.
 * Comparison is constant-time, and a missing or malformed signature is simply "not valid".
 */

function hex(secret, message) {
  return createHmac("sha256", String(secret)).update(String(message)).digest("hex");
}

function safeEqualHex(expected, given) {
  if (typeof given !== "string" || !/^[0-9a-f]{64}$/i.test(given)) return false;
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(given.toLowerCase(), "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function verifyCheckoutSignature({ orderId, paymentId, signature, secret }) {
  if (!orderId || !paymentId || !secret) return false;
  return safeEqualHex(hex(secret, `${orderId}|${paymentId}`), signature);
}

export function verifyWebhookSignature({ rawBody, signature, secret }) {
  if (typeof rawBody !== "string" || !secret) return false;
  return safeEqualHex(hex(secret, rawBody), signature);
}

/** For tests and local tooling only: produce the signature Razorpay would send. */
export const signCheckout = ({ orderId, paymentId, secret }) => hex(secret, `${orderId}|${paymentId}`);
export const signWebhook = ({ rawBody, secret }) => hex(secret, rawBody);
