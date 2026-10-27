import { channelForCategory } from "@/lib/push-channels";
import { safeNext } from "@/lib/safe-redirect";

/**
 * The pure half of Android push (the part that talks to Google is lib/services/fcm.js): reading the Firebase key from the
 * environment, building a message, and understanding Google's answer. No I/O, so it is tested directly.
 */

/**
 * The Firebase service account key (Firebase console > Project settings > Service accounts > Generate new private key), from the
 * environment: either the downloaded JSON file's text or that text base64-encoded (easier to paste into a host's settings page).
 * Returns the three fields that are used, or null when it is missing or not a service account key.
 */
export function parseServiceAccount(raw) {
  if (typeof raw !== "string" || !raw.trim()) return null;
  let text = raw.trim();
  if (!text.startsWith("{")) {
    try {
      text = Buffer.from(text, "base64").toString("utf8");
    } catch {
      return null;
    }
  }
  let key;
  try {
    key = JSON.parse(text);
  } catch {
    return null;
  }
  const { project_id: projectId, client_email: clientEmail, private_key: privateKey } = key ?? {};
  // The project id goes into a URL, so only the shape Firebase allows is accepted.
  if (typeof projectId !== "string" || !/^[a-z][a-z0-9-]{4,29}$/.test(projectId)) return null;
  if (typeof clientEmail !== "string" || !/^[^@\s]+@[^@\s]+$/.test(clientEmail)) return null;
  if (typeof privateKey !== "string" || !privateKey.includes("BEGIN PRIVATE KEY")) return null;
  return { project_id: projectId, client_email: clientEmail, private_key: privateKey };
}

const clip = (value, max) => String(value ?? "").slice(0, max);

/**
 * The FCM HTTP v1 request body for one device. `payload` is what every push carries: { title, body, url, tag, category }.
 * It is a "notification" message, which the system shows by itself even when the app is closed; the app only has to open
 * `data.url` when it is tapped. Lock-screen text never includes message bodies (lib/services/push.js builds `body`).
 */
export function buildFcmMessage(token, payload) {
  const channelId = channelForCategory(payload.category);
  const tag = typeof payload.tag === "string" && payload.tag ? payload.tag.slice(0, 100) : null;
  return {
    message: {
      token,
      notification: { title: clip(payload.title || "UniSphere", 80), body: clip(payload.body, 200) },
      // FCM data values must be strings, and the KEYS must not be reserved words: "from", "message_type", or anything starting with
      // "google" or "gcm". Google rejects the whole message for one (it once did, for a key called `from`). `origin` lets the app ignore
      // anything UniSphere did not send. Only a path on this site is ever opened from a notification (as in the service worker).
      data: { origin: "unisphere", url: safeNext(payload.url, "/notifications") },
      android: {
        // High priority wakes the phone at once, which only a direct message is worth. The rest wait for its next normal wake-up.
        priority: channelId === "messages" ? "HIGH" : "NORMAL",
        // The same one hour as Web Push: an old notification is not worth interrupting someone for.
        ttl: "3600s",
        // A new notification with the same tag replaces the one in the shade instead of piling up.
        notification: { channelId, ...(tag ? { tag } : {}) },
      },
    },
  };
}

/**
 * What a failed send means, from Google's HTTP status and JSON error body:
 *  - "gone": Google says the token is dead (the app was uninstalled or its data cleared): delete it.
 *  - "config": our own credentials or project are wrong. Never blame the tokens for that: one wrong setting would otherwise
 *    delete every member's device, so only an explicit UNREGISTERED answer counts as "gone".
 *  - "retry": Google is busy or unreachable; the notification is simply lost, the token is fine.
 *  - "failed": anything else; counted against the token, which is dropped after a few in a row.
 */
export function classifyFcmFailure(status, body) {
  const error = body?.error ?? {};
  const details = Array.isArray(error.details) ? error.details : [];
  const code = details.find((d) => d?.errorCode)?.errorCode ?? error.status ?? null;
  const badTokenField = details.some((d) => Array.isArray(d?.fieldViolations) && d.fieldViolations.some((v) => String(v?.field ?? "").includes("token")));

  if (code === "UNREGISTERED") return "gone";
  if (code === "INVALID_ARGUMENT" && badTokenField) return "gone";
  // A 404 without UNREGISTERED is the project that does not exist (a wrong id in the key), not a dead token.
  if (status === 404 || status === 401 || status === 403 || code === "SENDER_ID_MISMATCH" || code === "THIRD_PARTY_AUTH_ERROR" || code === "PERMISSION_DENIED") return "config";
  if (status === 429 || status >= 500 || code === "QUOTA_EXCEEDED" || code === "UNAVAILABLE" || code === "INTERNAL") return "retry";
  return "failed";
}
