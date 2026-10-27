import "server-only";
import { GoogleAuth } from "google-auth-library";
import { getEnv } from "@/lib/env";
import { buildFcmMessage, classifyFcmFailure, parseServiceAccount } from "@/lib/push-fcm";

/**
 * Sends one push to one Android device through Firebase Cloud Messaging (HTTP v1). Google's own auth library turns the service
 * account key into short-lived access tokens (and refreshes them); the request itself is a single POST, so the large Firebase Admin
 * SDK is not needed. What to send and how to read a failure is in lib/push-fcm.js.
 */
const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const TIMEOUT_MS = 10_000;

let cached = null; // { raw, projectId, auth }: rebuilt only if the environment value changes

function client() {
  const raw = getEnv().FIREBASE_SERVICE_ACCOUNT;
  if (cached?.raw === raw) return cached;
  const key = parseServiceAccount(raw);
  cached = key ? { raw, projectId: key.project_id, auth: new GoogleAuth({ credentials: key, scopes: [SCOPE] }) } : { raw, projectId: null, auth: null };
  return cached;
}

/**
 * Resolves { ok: true } or { ok: false, reason } where reason is one of "not_configured", "gone", "config", "retry", "failed"
 * (see classifyFcmFailure). It never throws: a push that cannot be sent must not stop the others in the same batch.
 */
export async function sendFcm(token, payload) {
  const { projectId, auth } = client();
  if (!auth) return { ok: false, reason: "not_configured" };
  try {
    const accessToken = await auth.getAccessToken();
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(buildFcmMessage(token, payload)),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.ok) return { ok: true };
    const reason = classifyFcmFailure(res.status, await res.json().catch(() => null));
    if (reason === "config") console.error("[push] FCM refused our credentials or project:", res.status);
    return { ok: false, reason };
  } catch (err) {
    // A network error or timeout reaching Google, or the key being rejected while fetching an access token.
    console.error("[push] FCM request failed:", err?.name ?? "error");
    return { ok: false, reason: "retry" };
  }
}
