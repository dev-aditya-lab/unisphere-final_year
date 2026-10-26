import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { getAppSecret } from "@/lib/env";

/**
 * The link that takes a member from the blue tick page to the payment gateway: /api/payments/checkout?t=<token>.
 *
 * The token is the gateway's checkout instructions (a page to open, or a form to post) sealed with AES-256-GCM under a key
 * derived from APP_SECRET, together with the member it was made for and an expiry. So it needs no database row, reveals
 * nothing (the form carries the member's name and email), cannot be altered or made up, and only works for that member's own
 * signed-in session within a few minutes.
 */

const TTL_MS = 15 * 60_000;
const MAX_TOKEN_LENGTH = 16_000;

const key = () => createHash("sha256").update(`unisphere:payment-checkout:v1:${getAppSecret()}`).digest();

export function sealCheckout({ userId, checkout, now = Date.now() }) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify({ u: userId, e: now + TTL_MS, c: checkout }), "utf8"), cipher.final()]);
  return `${iv.toString("base64url")}.${Buffer.concat([body, cipher.getAuthTag()]).toString("base64url")}`;
}

/** The checkout instructions, or null for anything that is not a fresh token made for exactly this member. */
export function openCheckout(token, { userId, now = Date.now() }) {
  if (typeof token !== "string" || token.length > MAX_TOKEN_LENGTH || !userId) return null;
  try {
    const [ivPart, dataPart, extra] = token.split(".");
    if (!ivPart || !dataPart || extra !== undefined) return null;
    const iv = Buffer.from(ivPart, "base64url");
    const data = Buffer.from(dataPart, "base64url");
    if (iv.length !== 12 || data.length <= 16) return null;
    const decipher = createDecipheriv("aes-256-gcm", key(), iv);
    decipher.setAuthTag(data.subarray(data.length - 16));
    const plain = Buffer.concat([decipher.update(data.subarray(0, data.length - 16)), decipher.final()]);
    const payload = JSON.parse(plain.toString("utf8"));
    if (payload?.u !== userId || !(payload?.e > now)) return null;
    return payload.c ?? null;
  } catch {
    return null;
  }
}
