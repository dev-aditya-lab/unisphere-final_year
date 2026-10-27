import { describe, expect, it } from "vitest";
import { isNativeAppUserAgent, nativeAppVersion } from "@/lib/native-app";
import { isValidPushToken, parseNativeDevice } from "@/lib/push-token";
import { PUSH_CHANNELS, channelForCategory } from "@/lib/push-channels";
import { NOTIFICATION_CATEGORIES } from "@/lib/notification-text";

const APP_UA = "Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UP1A.231105.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.6478.122 Mobile Safari/537.36 UniSphereApp/2.6.0 (Android)";
const CHROME_UA = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";

describe("recognising the Android app", () => {
  it("reads the version the app adds to its user agent", () => {
    expect(nativeAppVersion(APP_UA)).toBe("2.6.0");
    expect(isNativeAppUserAgent(APP_UA)).toBe(true);
  });

  it("does not take an ordinary browser, a missing header or a lookalike for the app", () => {
    expect(isNativeAppUserAgent(CHROME_UA)).toBe(false);
    expect(isNativeAppUserAgent(null)).toBe(false);
    expect(isNativeAppUserAgent(undefined)).toBe(false);
    expect(isNativeAppUserAgent({})).toBe(false);
    expect(isNativeAppUserAgent("XUniSphereApp/2.6.0")).toBe(false);
    expect(isNativeAppUserAgent("UniSphereApp/2.6")).toBe(false);
    expect(isNativeAppUserAgent("UniSphereApp/latest")).toBe(false);
  });
});

describe("a push token from the app", () => {
  const token = "f3Gh-_9:APA91bHnqzXyKq0aYy2Jt8vVwq0tYy9a0r1Tt3Yp5cQ_x8LmN0pQ2";

  it("accepts what a real FCM token looks like", () => {
    expect(isValidPushToken(token)).toBe(true);
    expect(parseNativeDevice({ token, platform: "android", appVersion: "2.6.0" })).toEqual({ token, platform: "android", appVersion: "2.6.0" });
  });

  it("drops an app version that is not a plain version number, and any field it does not know", () => {
    expect(parseNativeDevice({ token, platform: "android", appVersion: "2.6.0; drop table", extra: "x" })).toEqual({ token, platform: "android", appVersion: null });
    expect(parseNativeDevice({ token, platform: "android" })).toEqual({ token, platform: "android", appVersion: null });
  });

  it.each([
    ["too short", "abc"],
    ["a space", `${token} x`],
    ["a slash", `${token}/x`],
    ["a quote", `${token}'`],
    ["too long", "a".repeat(4097)],
    ["not a string", 12345],
  ])("rejects a token that is %s", (_why, bad) => {
    expect(isValidPushToken(bad)).toBe(false);
    expect(parseNativeDevice({ token: bad, platform: "android" })).toBeNull();
  });

  it("accepts only the platforms the server can send to", () => {
    expect(parseNativeDevice({ token, platform: "ios" })).toBeNull();
    expect(parseNativeDevice({ token })).toBeNull();
    expect(parseNativeDevice(null)).toBeNull();
    expect(parseNativeDevice("token")).toBeNull();
  });
});

describe("Android notification channels", () => {
  it("has a channel for every notification category, and only for channels the app creates", () => {
    const ids = new Set(PUSH_CHANNELS.map((c) => c.id));
    for (const { value } of NOTIFICATION_CATEGORIES) expect(ids.has(channelForCategory(value)), value).toBe(true);
  });

  it("puts direct messages on their own, higher-priority channel and unknown categories on the quiet one", () => {
    expect(channelForCategory("messages")).toBe("messages");
    expect(PUSH_CHANNELS.find((c) => c.id === "messages").importance).toBeGreaterThan(PUSH_CHANNELS.find((c) => c.id === "updates").importance);
    expect(channelForCategory("something-new")).toBe("updates");
    expect(channelForCategory(undefined)).toBe("updates");
  });
});
