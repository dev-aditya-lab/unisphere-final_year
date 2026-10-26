import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * HMAC helpers for payment gateway adapters, kept free of I/O so they can be tested on their own.
 *
 * Almost every gateway authenticates a webhook (or a redirect back to the shop) with an HMAC of some message under a shared
 * secret, differing only in the hash (`sha256`, `sha512`), the encoding of the result (`hex`, `base64`) and what the message is
 * (the raw body, `timestamp.body`, `order|payment`). An adapter picks those; the comparison here is constant-time, and a missing
 * or malformed signature is simply "not valid".
 */

/** The signature a gateway would send. Also what tests use to sign their own fixtures. */
export function signHmac({ message, secret, algorithm = "sha256", encoding = "hex" }) {
  return createHmac(algorithm, String(secret)).update(String(message)).digest(encoding);
}

export function verifyHmac({ message, signature, secret, algorithm = "sha256", encoding = "hex" }) {
  if (typeof message !== "string" || typeof signature !== "string" || !secret) return false;
  const expected = Buffer.from(signHmac({ message, secret, algorithm, encoding }));
  // Hex has one spelling per value, so case is not part of the signature; base64 is case-sensitive.
  const given = Buffer.from(encoding === "hex" ? signature.toLowerCase() : signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
