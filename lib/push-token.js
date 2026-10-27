/**
 * What the Android app sends to register for push: the token Firebase Cloud Messaging gave the app on that phone.
 *
 * Like a Web Push address (lib/push-endpoint.js), a token is stored and later sent to Google, and the request that stores it can be
 * made by any signed-in member. So only the shape of a real token is accepted: URL-safe characters, at a sane length. Whether it
 * is genuine is Google's to say when a push is sent; a token that is not gets deleted then (lib/services/push.js).
 */
const TOKEN = /^[A-Za-z0-9_:.-]{20,4096}$/;
const APP_VERSION = /^\d{1,3}\.\d{1,3}\.\d{1,3}$/;

export const NATIVE_PLATFORMS = ["android"];

export const isValidPushToken = (token) => typeof token === "string" && TOKEN.test(token);

/** The device record from a request body, or null when it is not valid. Unknown fields are dropped. */
export function parseNativeDevice(input) {
  if (!input || typeof input !== "object") return null;
  const { token, platform, appVersion } = input;
  if (!isValidPushToken(token) || !NATIVE_PLATFORMS.includes(platform)) return null;
  return { token, platform, appVersion: typeof appVersion === "string" && APP_VERSION.test(appVersion) ? appVersion : null };
}
