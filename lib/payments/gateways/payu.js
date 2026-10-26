import { randomUUID } from "node:crypto";
import { publicEnv } from "@/lib/env-public";
import { gatewayRequest } from "@/lib/payments/http";
import { digestHex, safeEqual } from "@/lib/payments/signature";

/**
 * PayU India, PayU Hosted Checkout (https://docs.payu.in). The member is sent to PayU's own payment page by posting a signed form;
 * PayU sends them back to a short return address by POST; and the truth about a payment is read from PayU's Verify Payment API.
 *
 * Settings (the generic PAYMENT_* values):
 *   PAYMENT_KEY_ID              the merchant KEY from the PayU dashboard (Payment Gateway > Key Salt Details)
 *   PAYMENT_KEY_SECRET          the SALT from the same page. Never sent to PayU: it only goes into hashes.
 *   PAYMENT_API_BASE_URL        https://test.payu.in for PayU's test environment; leave empty for live. (Test keys and live
 *                               keys are different, so switch both together.)
 *   PAYMENT_WEBHOOK_SECRET      not used: PayU signs webhooks with the salt.
 *
 * PayU facts this relies on (see docs/PAYMENTS.md for the links):
 *   - There is no "create order" call: the order is a `txnid` (at most 25 characters, unique) plus a hash of the fields.
 *   - Request hash:  sha512(key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||SALT)
 *   - Response hash: sha512(SALT|status||||||udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key),
 *                    with `additional_charges|` in front when PayU reports additional charges.
 *   - Command APIs (verify_payment, refunds): POST form to postservice.php with hash sha512(key|command|var1|SALT).
 *   - surl/furl are documented as at most 50 characters, so the return address carries no query string; the order is
 *     recognised from the `txnid` PayU posts back (see parseReturn).
 */

const PAY_PATH = "/_payment";
const live = { pay: "https://secure.payu.in", api: "https://info.payu.in/merchant/postservice.php?form=2" };
const test = { pay: "https://test.payu.in", api: "https://test.payu.in/merchant/postservice.php?form=2" };

/** Anything other than PayU's own test host means live: a typo can never send the salt to some other server. */
const hosts = (cfg) => {
  try {
    return new URL(cfg.baseUrl).hostname === "test.payu.in" ? test : live;
  } catch {
    return live;
  }
};

const amountText = (paise) => (paise / 100).toFixed(2);
const toPaise = (text) => {
  const n = Number(text);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : NaN;
};

/** PayU rejects unusual characters in free-text fields; keep to plain ASCII and its length limits (firstname: 60 live, 20 test). */
const plain = (value, max, fallback) => String(value ?? "").replace(/[^A-Za-z0-9 ._-]/g, "").replace(/\s+/g, " ").trim().slice(0, max) || fallback;

// ── Hashes ──────────────────────────────────────────────────────────────────

const field = (v) => (v == null ? "" : String(v));

export function requestHash(f, salt) {
  return digestHex([f.key, f.txnid, f.amount, f.productinfo, f.firstname, f.email, f.udf1, f.udf2, f.udf3, f.udf4, f.udf5, "", "", "", "", "", salt].map(field).join("|"));
}

/** What PayU's hash should be for a response (the browser return, or a payment webhook). Both spellings of additional charges are accepted. */
export function responseHashes(p, salt) {
  const plainParts = [salt, p.status, "", "", "", "", "", p.udf5, p.udf4, p.udf3, p.udf2, p.udf1, p.email, p.firstname, p.productinfo, p.amount, p.txnid, p.key].map(field);
  const charges = field(p.additionalCharges ?? p.additional_charges);
  return charges ? [digestHex([charges, ...plainParts].join("|")), digestHex(plainParts.join("|"))] : [digestHex(plainParts.join("|"))];
}

export function verifyResponseHash(p, salt) {
  if (!salt || typeof p?.hash !== "string") return false;
  const given = p.hash.trim().toLowerCase();
  return responseHashes(p, salt).some((expected) => safeEqual(expected, given));
}

// ── PayU's command API ──────────────────────────────────────────────────────

function command(cfg, name, var1, extra = {}) {
  return gatewayRequest({
    tag: "payu",
    method: "POST",
    url: hosts(cfg).api,
    form: { key: cfg.keyId, command: name, var1, ...extra, hash: digestHex([cfg.keyId, name, var1, cfg.keySecret].join("|")) },
    describeError: (json) => ({ code: json?.error_code ?? json?.status, message: json?.msg }),
  });
}

/** PayU's words for a payment, in ours. Only a captured, successful payment is "paid". */
function mapStatus(status, unmapped) {
  const s = String(status ?? "").toLowerCase();
  const u = String(unmapped ?? "").toLowerCase();
  if (s === "success" && (u === "captured" || u === "")) return "paid";
  if (s === "failure" || s === "failed" || ["failed", "usercancelled", "dropped", "bounced"].includes(u)) return "failed";
  // "auth" (authorised, not captured), "pending", or anything unrecognised: never counted as paid.
  return "pending";
}

const NOT_FOUND = (v) => String(v ?? "").toLowerCase() === "not found";

/** Every object that describes an action (a capture, a refund) somewhere inside a check_action_status answer. */
function collectActions(node, depth = 0, found = []) {
  if (!node || typeof node !== "object" || depth > 3) return found;
  if ("action" in node && "status" in node) found.push(node);
  else for (const child of Object.values(node)) collectActions(child, depth + 1, found);
  return found;
}

const payu = {
  id: "payu",
  label: "PayU",

  isConfigured: (cfg) => Boolean(cfg.keyId && cfg.keySecret),
  // PayU signs webhooks with the salt, so there is no separate webhook secret to wait for.
  webhookReady: (cfg) => Boolean(cfg.keyId && cfg.keySecret),

  async createOrder(cfg, { amountPaise, reference, description, returnUrl, customer }) {
    const txnid = String(reference ?? "").replace(/[^A-Za-z0-9]/g, "").slice(0, 25);
    const email = String(customer?.email ?? "").trim().slice(0, 50);
    if (txnid.length < 8 || !email) return { ok: false, error: "We could not start the payment. Please try again.", code: "invalid_order" };

    // The return address has no query string (surl and furl are documented as at most 50 characters).
    const back = new URL(returnUrl);
    back.search = "";
    const fields = {
      key: cfg.keyId,
      txnid,
      amount: amountText(amountPaise),
      productinfo: plain(description, 100, "UniSphere"),
      firstname: plain(customer?.name, hosts(cfg) === test ? 20 : 60, "Member"),
      email,
      surl: back.toString(),
      furl: back.toString(),
      curl: back.toString(),
      // Echoed back by PayU, so a payment can be matched to our own order reference when reconciling by hand.
      udf1: String(reference).slice(0, 255),
    };
    fields.hash = requestHash(fields, cfg.keySecret);
    return { ok: true, orderId: txnid, checkout: { type: "form", action: `${hosts(cfg).pay}${PAY_PATH}`, method: "POST", fields } };
  },

  async getOrderPayment(cfg, { orderId }) {
    const res = await command(cfg, "verify_payment", orderId);
    if (!res.ok) return res;
    const raw = res.data?.transaction_details?.[orderId];
    if (!raw) return { ok: false, error: "The payment provider could not complete that. Please try again.", code: "provider_error" };
    // PayU answers "Not Found" until the member has actually reached its payment page.
    if (!Array.isArray(raw) && (NOT_FOUND(raw.mihpayid) || NOT_FOUND(raw.status))) return { ok: true, payment: null };
    // If a txnid was tried more than once PayU may list every attempt: the successful one wins, else the latest.
    const entry = Array.isArray(raw) ? (raw.find((e) => mapStatus(e.status, e.unmappedstatus) === "paid") ?? raw[raw.length - 1]) : raw;
    return {
      ok: true,
      payment: {
        id: String(entry.mihpayid ?? ""),
        orderId: String(entry.txnid ?? orderId),
        amountPaise: toPaise(entry.amt ?? entry.transaction_amount),
        currency: "INR",
        status: mapStatus(entry.status, entry.unmappedstatus),
        method: entry.mode ? String(entry.mode).toLowerCase() : undefined,
      },
    };
  },

  async refundPayment(cfg, { paymentId, amountPaise }) {
    const res = await command(cfg, "cancel_refund_transaction", paymentId, {
      // A token of our own, unique per request and at most 23 characters, as PayU requires.
      var2: randomUUID().replace(/-/g, "").slice(0, 23),
      var3: amountText(amountPaise),
      ...(publicEnv.appUrl.startsWith("https://") ? { var5: `${publicEnv.appUrl}/api/payments/webhook` } : {}),
    });
    if (!res.ok) return res;
    if (Number(res.data?.status) === 1) return { ok: true };
    return { ok: false, error: "The payment provider could not complete that. Please try again.", code: "provider_error", providerMessage: typeof res.data?.msg === "string" ? res.data.msg.slice(0, 200) : null };
  },

  // PayU posts the member back with their payment fields (txnid among them) to the short return address.
  parseReturn(cfg, { query, form }) {
    const txnid = form?.get?.("txnid") ?? query?.get?.("txnid");
    return typeof txnid === "string" && /^[A-Za-z0-9]{1,25}$/.test(txnid) ? { orderId: txnid } : null;
  },

  async parseWebhook(cfg, { rawBody }) {
    // Refund and dispute events are JSON and carry no hash; payment events are form posts signed with the salt.
    if (rawBody.trimStart().startsWith("{")) {
      let j;
      try {
        j = JSON.parse(rawBody);
      } catch {
        return { ok: false, status: 400 };
      }
      const isRefund = String(j?.action ?? "").toLowerCase() === "refund" && String(j?.status ?? "").toLowerCase() === "success" && /^\d{1,30}$/.test(String(j?.mihpayid ?? ""));
      if (!isRefund) return { ok: true, event: null }; // refund failures, ARN updates, disputes: nothing to record
      // Unsigned, so it is not believed: PayU is asked whether that refund really happened.
      const asked = await command(cfg, "check_action_status", String(j.mihpayid), { var2: "payuid" });
      if (!asked.ok) throw new Error("could not confirm the refund with PayU");
      const confirmed = collectActions(asked.data?.transaction_details).some(
        (a) => /refund/i.test(String(a.action)) && /^success$/i.test(String(a.status)) && (!j.request_id || String(a.request_id) === String(j.request_id)),
      );
      return confirmed ? { ok: true, event: { type: "refund.done", paymentId: String(j.mihpayid) } } : { ok: false, status: 401 };
    }

    const p = Object.fromEntries(new URLSearchParams(rawBody));
    if (p.key !== cfg.keyId || !verifyResponseHash(p, cfg.keySecret)) return { ok: false, status: 401 };
    if (!/^[A-Za-z0-9]{1,25}$/.test(p.txnid ?? "")) return { ok: false, status: 400 };
    const state = mapStatus(p.status, p.unmappedstatus);
    if (state === "paid") return { ok: true, event: { type: "payment.paid", orderId: p.txnid, paymentId: p.mihpayid } };
    if (state === "failed") return { ok: true, event: { type: "payment.failed", orderId: p.txnid, paymentId: p.mihpayid, reason: p.error || p.unmappedstatus } };
    return { ok: true, event: null };
  },
};

export default payu;
