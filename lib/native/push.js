import { isNativeApp } from "@/lib/native/client";
import { nativeAppVersion } from "@/lib/native-app";
import { PUSH_CHANNELS } from "@/lib/push-channels";
import { afterNudge, decideNudge, parseNudgeHistory, silencedNudges } from "@/lib/native/push-nudge";
import { safeNext } from "@/lib/safe-redirect";

/**
 * Push notifications in the Android app (docs/ANDROID_APP.md). The app asks Android for permission, gets a token from Firebase
 * Cloud Messaging, and tells the server (/api/push/native) which phone it is. The server sends to that token (lib/services/push.js).
 *
 * Opt-in is per phone and per member, like Web Push: nothing is registered until the member turns notifications on, and signing out
 * forgets the phone on the server, so the next person to sign in on it never receives the previous member's notifications.
 * Everything here is loaded only inside the app (lib/native/client.js).
 */
const TOKEN_KEY = "unisphere:fcm-token"; // this phone's token, kept only so signing out can tell the server to forget it
const ENABLED_KEY = "unisphere:native-push"; // "1" once the member has turned notifications on in this app
const NUDGE_KEY = "unisphere:native-push-nudge"; // how often the "turn on notifications" pop-up was shown (lib/native/push-nudge.js)
const REGISTER_TIMEOUT_MS = 20_000;

const read = (key) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key, value) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage is blocked: push still works for this session */
  }
};

/**
 * The plugin, wrapped in an object on purpose. A Capacitor plugin is a Proxy that answers EVERY property, including `then`, so a plugin
 * that is returned from an async function (or awaited) is taken for a promise: JavaScript calls its `then`, which Capacitor sends to
 * the phone as a method that does not exist, and the call never finishes. Always pass a plugin around inside an object like this one.
 */
const loadPush = async () => ({ Push: (await import("@capacitor/push-notifications")).PushNotifications });

const NATIVE_CALL_TIMEOUT_MS = 8000;
/** A question to the phone that gets no answer must not leave the screen on "Checking…" for ever. */
const withTimeout = (promise, ms = NATIVE_CALL_TIMEOUT_MS) =>
  Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);
const permissionOf = async (Push) => (await withTimeout(Push.checkPermissions())).receive;

let pending = null; // { resolve, reject } while enableNativePush waits for the token
let wiring = null;
let navigate = (path) => window.location.assign(path);

/** How to open a page when a notification is tapped (the app passes the router, so the page changes without a full reload). */
export const setNativeNavigator = (fn) => {
  navigate = fn;
};

async function postToken(token) {
  const res = await fetch("/api/push/native", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, platform: "android", appVersion: nativeAppVersion(navigator.userAgent) }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "failed");
  write(TOKEN_KEY, token);
}

async function ensureChannels(Push) {
  for (const { id, name, description, importance } of PUSH_CHANNELS) {
    await Push.createChannel({ id, name, description, importance, vibration: true }).catch(() => {});
  }
}

/** Installs the listeners once per page load. Safe to call again. */
function wire() {
  wiring ??= (async () => {
    const { Push } = await loadPush();
    await ensureChannels(Push);
    await Push.addListener("registration", async ({ value }) => {
      if (read(ENABLED_KEY) !== "1") return; // signed out or turned off: a late token is not wanted
      try {
        await postToken(value);
        pending?.resolve();
      } catch (err) {
        pending?.reject(err);
      }
    });
    await Push.addListener("registrationError", (event) => pending?.reject(new Error(event?.error || "registration failed")));
    // A tap on a notification opens the page it is about. Only a path on this site is ever opened.
    await Push.addListener("pushNotificationActionPerformed", (action) => {
      const data = action?.notification?.data;
      if (data?.origin === "unisphere") navigate(safeNext(data.url, "/notifications"));
    });
    return { Push };
  })();
  // A failed load (a dropped connection while fetching the plugin) must not stay cached: the next call tries again.
  wiring.catch(() => {
    wiring = null;
  });
  return wiring;
}

/**
 * Called when a signed-in member opens the app. If they turned notifications on, asks Firebase for the token again: it is the same
 * token unless Firebase rotated it, and the server uses the visit to know the phone is still in use.
 */
export async function initNativePush() {
  if (!isNativeApp()) return;
  const { Push } = await wire();
  if (read(ENABLED_KEY) !== "1") return;
  const receive = await permissionOf(Push);
  if (receive === "granted") await Push.register();
  else write(ENABLED_KEY, null); // the permission was taken away in the phone's settings
}

/** { supported, permission: "granted" | "denied" | "prompt", enabled } for the settings screen (or { supported: false, failed: true }). */
export async function getNativePushState() {
  if (!isNativeApp()) return { supported: false };
  try {
    const { Push } = await loadPush();
    const receive = await permissionOf(Push);
    const permission = receive === "granted" ? "granted" : receive === "denied" ? "denied" : "prompt";
    return { supported: true, permission, enabled: permission === "granted" && read(ENABLED_KEY) === "1" };
  } catch {
    // The phone did not answer, or this build of the app cannot do push. `failed` lets the screen offer "Try again".
    return { supported: false, failed: true };
  }
}

/** Turns notifications on for this phone: asks Android for permission, gets a token, tells the server. Resolves { ok } or { ok: false, error }. */
export async function enableNativePush() {
  try {
    const { Push } = await wire();
    let receive = await permissionOf(Push);
    if (receive !== "granted") ({ receive } = await Push.requestPermissions());
    // `blocked`: the member (or Android, after two refusals) said no. Not a failure to retry, so the pop-up closes instead of nagging.
    if (receive !== "granted") return { ok: false, blocked: true, error: "Notifications are blocked. Allow them for UniSphere in your phone's settings, then try again." };
    write(ENABLED_KEY, "1");
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timeout")), REGISTER_TIMEOUT_MS);
      pending = {
        resolve: () => {
          clearTimeout(timer);
          resolve();
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      };
      Push.register().catch(reject);
    });
    return { ok: true };
  } catch (err) {
    write(ENABLED_KEY, null);
    const known = err?.message && !["timeout", "failed", "registration failed"].includes(err.message) ? err.message : null;
    return { ok: false, error: known ?? "Could not turn on notifications on this phone. Check your connection and try again." };
  } finally {
    pending = null;
  }
}

/**
 * Turns notifications off for this phone and forgets it on the server. Also what signing out does. If the server cannot be reached,
 * discarding the token with Firebase still ends delivery: the server drops a dead token the next time it tries it.
 */
export async function disableNativePush() {
  if (!isNativeApp()) return;
  const token = read(TOKEN_KEY);
  write(ENABLED_KEY, null);
  write(TOKEN_KEY, null);
  if (token) {
    await fetch("/api/push/native", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) }).catch(() => {});
  }
  try {
    const { Push } = await loadPush();
    await Push.unregister();
  } catch {
    /* nothing registered */
  }
}

/** "ask", "settings" or null: which "turn on notifications" pop-up to show now, if any (the rules are in lib/native/push-nudge.js). */
export async function getNativePushNudge() {
  if (!isNativeApp()) return null;
  return decideNudge({ state: await getNativePushState(), history: parseNudgeHistory(read(NUDGE_KEY)) });
}

/** Call when the pop-up is shown (so closing it any way at all counts as one), and with { never: true } for "Don't ask again". */
export const recordNativePushNudge = ({ never = false } = {}) => write(NUDGE_KEY, JSON.stringify(afterNudge(parseNudgeHistory(read(NUDGE_KEY)), Date.now(), { never })));

/** The member switched notifications off themselves: that is a decision, so the pop-up never comes back. */
export const silenceNativePushNudges = () => write(NUDGE_KEY, JSON.stringify(silencedNudges(parseNudgeHistory(read(NUDGE_KEY)))));

let awaitingSettings = false;

/**
 * Opens this app's notification page in the phone's settings. Android shows its own permission box only twice; after that, this is
 * the only way. The app remembers it sent the member there, so it can finish turning notifications on when they come back
 * (see consumeSettingsReturn).
 */
export async function openNativeNotificationSettings() {
  try {
    const { NativeSettings, AndroidSettings } = await import("capacitor-native-settings");
    awaitingSettings = true;
    await NativeSettings.openAndroid({ option: AndroidSettings.AppNotification });
    return true;
  } catch {
    awaitingSettings = false;
    return false;
  }
}

/** True once after the member was sent to the phone's settings and has come back to the app. */
export function consumeSettingsReturn() {
  const was = awaitingSettings;
  awaitingSettings = false;
  return was;
}
