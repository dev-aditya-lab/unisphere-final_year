import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { getAppSecret } from "@/lib/env";

/**
 * Encrypts a small secret (for example a Google refresh token) before it is stored, with AES-256-GCM from Node's own crypto module.
 * The key is derived from APP_SECRET and a purpose label, so a value sealed for one purpose cannot be opened as another, and a copy of
 * the database alone reveals nothing. Any change to the stored text makes opening it fail.
 *
 * Rotating APP_SECRET makes existing sealed values unreadable; the owner then reconnects the integration (it is not a data loss).
 */
const key = (purpose) => createHash("sha256").update(`unisphere:secret-box:v1:${purpose}:${getAppSecret()}`).digest();

export function sealSecret(plain, purpose) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(purpose), iv);
  const body = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${Buffer.concat([body, cipher.getAuthTag()]).toString("base64url")}`;
}

/** The secret, or null for anything that was not sealed by this app for this purpose. */
export function openSecret(sealed, purpose) {
  try {
    const [version, ivPart, dataPart, extra] = String(sealed).split(".");
    if (version !== "v1" || !ivPart || !dataPart || extra !== undefined) return null;
    const iv = Buffer.from(ivPart, "base64url");
    const data = Buffer.from(dataPart, "base64url");
    if (iv.length !== 12 || data.length <= 16) return null;
    const decipher = createDecipheriv("aes-256-gcm", key(purpose), iv);
    decipher.setAuthTag(data.subarray(data.length - 16));
    return Buffer.concat([decipher.update(data.subarray(0, data.length - 16)), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
