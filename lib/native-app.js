/**
 * The Android app (docs/ANDROID_APP.md) is a native shell around this site. It adds one token to its user agent
 * (capacitor.config.ts, android.appendUserAgent), which is how the server recognises it.
 *
 * It is a presentation hint and nothing more: any client can send any user agent, so nothing secure may depend on it. It is used
 * to skip the public landing page and to leave out the blue tick purchase (Google Play requires Play Billing for digital goods
 * sold inside an app), never to grant or protect anything.
 */
const NATIVE_APP_TOKEN = /\bUniSphereApp\/(\d{1,3}\.\d{1,3}\.\d{1,3})\b/;

/** The app's version ("2.6.0") when the user agent is the Android app's, otherwise null. */
export function nativeAppVersion(userAgent) {
  const match = NATIVE_APP_TOKEN.exec(typeof userAgent === "string" ? userAgent : "");
  return match ? match[1] : null;
}

export const isNativeAppUserAgent = (userAgent) => nativeAppVersion(userAgent) !== null;
