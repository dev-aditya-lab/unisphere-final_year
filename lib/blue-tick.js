/**
 * Blue tick: one-time, administrator-confirmed badge. Plain data and formatting, safe for client and server.
 *
 * Money is held in paise (1 INR = 100 paise) everywhere, as payment gateways do, so there is no rounding.
 */

export const BLUE_TICK_PATH = "/settings/blue-tick";

/** Where a member is sent to pay: a tiny page that hands them over to the payment gateway. Takes `?t=<sealed checkout>`. */
export const PAYMENT_CHECKOUT_PATH = "/api/payments/checkout";

/** Where the payment gateway sends a member back to (and where "check again" goes). Takes `?o=<order id>`. */
export const PAYMENT_RETURN_PATH = "/api/payments/return";

/** What the blue tick page can be told about a payment just attempted, in `?payment=`. A display hint only, never believed. */
export const PAYMENT_NOTICES = ["done", "pending", "failed", "duplicate"];

/** Allowed price range, in paise. The database enforces the same limits. */
export const MIN_PRICE_PAISE = 100; // ₹1, the smallest amount payment gateways accept
export const MAX_PRICE_PAISE = 10_000_000; // ₹1,00,000

export function formatInr(paise, { withZero = false } = {}) {
  const rupees = Number(paise) / 100;
  if (!Number.isFinite(rupees)) return "—";
  const whole = Number.isInteger(rupees) && !withZero;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(rupees);
}

/** "99" or "99.50" typed by an administrator -> paise, or null when it is not a valid amount. */
export function rupeesToPaise(input) {
  const text = String(input ?? "").trim();
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(text)) return null;
  const paise = Math.round(Number(text) * 100);
  return paise >= MIN_PRICE_PAISE && paise <= MAX_PRICE_PAISE ? paise : null;
}

export const paiseToRupeesInput = (paise) => (Number(paise) / 100).toFixed(Number(paise) % 100 === 0 ? 0 : 2);

/** Where a member is in the process, from their application. */
export const APPLICATION_STEPS = {
  awaiting_document: "Send your ID for review",
  pending_review: "Waiting for review",
  approved: "Verified",
  refunded: "Refunded",
};
