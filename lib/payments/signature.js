import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * HMAC helpers for payment gateway adapters, kept free of I/O so they can be tested on their own.
 *
 * Almost every gateway authenticates a webhook (or a redirect back to the shop) with an HMAC of some message under a shared
 * secret, differing only in the hash (`sha256`, `sha512`), the encoding of the result (`hex`, `base64`) and what the message is
 * (the raw body, `timestamp.body`, `order|payment`). An adapter picks those; the comparison here is constant-time, and a missing
 * or malformed signature is simply "not valid".
 */

/** Constant-time comparison. False unless both are strings of the same length and value. */
export function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** An unkeyed digest, for gateways whose "signature" is a hash of the fields with the secret mixed in (not an HMAC). */
export const digestHex = (message, algorithm = "sha512") => createHash(algorithm).update(String(message)).digest("hex");

/** The signature a gateway would send. Also what tests use to sign their own fixtures. */
export function signHmac({ message, secret, algorithm = "sha256", encoding = "hex" }) {
  return createHmac(algorithm, String(secret)).update(String(message)).digest(encoding);
}

export function verifyHmac({ message, signature, secret, algorithm = "sha256", encoding = "hex" }) {
  if (typeof message !== "string" || typeof signature !== "string" || !secret) return false;
  // Hex has one spelling per value, so case is not part of the signature; base64 is case-sensitive.
  return safeEqual(signHmac({ message, secret, algorithm, encoding }), encoding === "hex" ? signature.toLowerCase() : signature);
}
