import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The Android app's push flow (lib/native/push.js) end to end, with a fake phone: the plugin (built like Capacitor's own, a Proxy that
// answers `then` too), localStorage, and the server. What it proves is the order of events a real phone goes through: permission,
// registration, telling the server, forgetting on sign-out, and opening the page a notification is about.
const h = vi.hoisted(() => ({
  permission: "prompt", // what Android currently says
  askResult: "granted", // what the member answers when Android asks
  token: "f3Gh-_9:APA91bHnqzXyKq0aYy2Jt8vVwq0tYy9a0r1Tt3Yp5cQ_x8LmN0pQ2",
  registers: true, // does Firebase hand back a token after register()?
  listeners: {},
  calls: [],
  settingsFails: false,
}));

vi.mock("@capacitor/push-notifications", () => {
  const impl = {
    addListener: async (event, callback) => {
      h.listeners[event] = callback;
      return { remove: async () => void delete h.listeners[event] };
    },
    checkPermissions: async () => ({ receive: h.permission }),
    requestPermissions: async () => {
      h.calls.push("requestPermissions");
      h.permission = h.askResult;
      return { receive: h.permission };
    },
    register: async () => {
      h.calls.push("register");
      if (h.registers) setTimeout(() => h.listeners.registration?.({ value: h.token }), 0);
    },
    unregister: async () => void h.calls.push("unregister"),
    createChannel: async ({ id }) => void h.calls.push(`channel:${id}`),
  };
  const PushNotifications = new Proxy({}, { get: (_, prop) => (prop === "then" ? () => new Promise(() => {}) : impl[prop]) });
  return { PushNotifications };
});
vi.mock("capacitor-native-settings", () => ({
  AndroidSettings: { AppNotification: "app_notification" },
  NativeSettings: {
    openAndroid: async (options) => {
      h.calls.push(`settings:${options.option}`);
      if (h.settingsFails) throw new Error("no such screen");
      return { status: true };
    },
  },
}));

const APP_UA = "Mozilla/5.0 (Linux; Android 14; wv) Chrome/126.0 Mobile Safari/537.36 UniSphereApp/2.6.0 (Android)";
let push;
let store;
let server;
let fetchMock;

beforeEach(async () => {
  Object.assign(h, { permission: "prompt", askResult: "granted", registers: true, listeners: {}, calls: [], settingsFails: false });
  store = new Map();
  vi.stubGlobal("localStorage", { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => void store.set(k, String(v)), removeItem: (k) => void store.delete(k) });
  vi.stubGlobal("navigator", { userAgent: APP_UA });
  vi.stubGlobal("window", { Capacitor: { isNativePlatform: () => true }, location: { assign: vi.fn() } });
  server = { ok: true, error: "server says no" };
  fetchMock = vi.fn(async (url, init) => ({ ok: server.ok, json: async () => ({ error: server.error }) }));
  vi.stubGlobal("fetch", fetchMock);
  vi.resetModules(); // the module keeps listeners and a pending registration between calls: every test starts fresh
  push = await import("@/lib/native/push");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const posts = () => fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");

describe("turning notifications on", () => {
  it("asks Android, gets a token, tells the server which phone it is, and remembers", async () => {
    expect(await push.getNativePushState()).toEqual({ supported: true, permission: "prompt", enabled: false });
    const result = await push.enableNativePush();
    expect(result).toEqual({ ok: true });
    expect(h.calls).toContain("requestPermissions");
    expect(h.calls).toContain("register");
    expect(h.calls.filter((c) => c.startsWith("channel:")).sort()).toEqual(["channel:messages", "channel:social", "channel:updates"]);
    expect(posts()).toHaveLength(1);
    const [url, init] = posts()[0];
    expect(url).toBe("/api/push/native");
    expect(JSON.parse(init.body)).toEqual({ token: h.token, platform: "android", appVersion: "2.6.0" });
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(store.get("unisphere:native-push")).toBe("1");
    expect(store.get("unisphere:fcm-token")).toBe(h.token);
    expect(await push.getNativePushState()).toEqual({ supported: true, permission: "granted", enabled: true });
  });

  it("does not ask again when Android already allows it (and Android 12 and older never show a box at all)", async () => {
    h.permission = "granted";
    expect(await push.enableNativePush()).toEqual({ ok: true });
    expect(h.calls).not.toContain("requestPermissions");
  });

  it("stops quietly when the member refuses: nothing is registered and the pop-up can close instead of nagging", async () => {
    h.askResult = "denied";
    const result = await push.enableNativePush();
    expect(result).toMatchObject({ ok: false, blocked: true });
    expect(h.calls).not.toContain("register");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(store.has("unisphere:native-push")).toBe(false);
  });

  it("reports what the server said when it will not take the phone, and does not stay switched on", async () => {
    server.ok = false;
    server.error = "Could not turn on notifications on this device.";
    const result = await push.enableNativePush();
    expect(result).toEqual({ ok: false, error: "Could not turn on notifications on this device." });
    expect(store.has("unisphere:native-push")).toBe(false);
  });

  it("gives up after 20 seconds if Firebase never hands back a token", async () => {
    h.registers = false;
    vi.useFakeTimers();
    const pending = push.enableNativePush();
    await vi.advanceTimersByTimeAsync(20_500);
    const result = await pending;
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Could not turn on notifications on this phone/);
    expect(store.has("unisphere:native-push")).toBe(false);
  });

  it("reports a registration error from Firebase", async () => {
    h.registers = false;
    const pending = push.enableNativePush();
    await vi.waitFor(() => expect(h.calls).toContain("register"));
    h.listeners.registrationError({ error: "SERVICE_NOT_AVAILABLE" });
    expect(await pending).toEqual({ ok: false, error: "SERVICE_NOT_AVAILABLE" });
  });

  it("ignores a token that arrives after notifications were switched off", async () => {
    await push.initNativePush(); // installs the listeners
    await h.listeners.registration({ value: h.token });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("starting the app", () => {
  it("asks Firebase for the token again when notifications are on, so the server knows the phone is still in use", async () => {
    store.set("unisphere:native-push", "1");
    h.permission = "granted";
    await push.initNativePush();
    expect(h.calls).toContain("register");
    await vi.waitFor(() => expect(posts()).toHaveLength(1));
  });

  it("does not register a phone that never opted in", async () => {
    h.permission = "granted";
    await push.initNativePush();
    expect(h.calls).not.toContain("register");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("switches itself off when the member took the permission away in the phone's settings", async () => {
    store.set("unisphere:native-push", "1");
    h.permission = "denied";
    await push.initNativePush();
    expect(h.calls).not.toContain("register");
    expect(store.has("unisphere:native-push")).toBe(false);
  });
});

describe("signing out or turning off", () => {
  it("tells the server to forget this phone, then discards the token with Firebase, and forgets locally", async () => {
    await push.enableNativePush();
    fetchMock.mockClear();
    h.calls.length = 0;
    await push.disableNativePush();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/push/native");
    expect(init.method).toBe("DELETE");
    expect(JSON.parse(init.body)).toEqual({ token: h.token });
    expect(h.calls).toContain("unregister");
    expect(store.has("unisphere:native-push")).toBe(false);
    expect(store.has("unisphere:fcm-token")).toBe(false);
  });

  it("still discards the token with Firebase when the server cannot be reached, which ends delivery anyway", async () => {
    await push.enableNativePush();
    fetchMock.mockRejectedValue(new Error("offline"));
    h.calls.length = 0;
    await push.disableNativePush();
    expect(h.calls).toContain("unregister");
    expect(store.has("unisphere:native-push")).toBe(false);
  });

  it("does not call the server for a phone that was never registered", async () => {
    await push.disableNativePush();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("tapping a notification", () => {
  const tap = (data) => h.listeners.pushNotificationActionPerformed({ notification: { data } });
  let navigate;
  beforeEach(async () => {
    navigate = vi.fn();
    push.setNativeNavigator(navigate);
    await push.initNativePush();
  });

  it("opens the page it is about", () => {
    tap({ origin: "unisphere", url: "/posts/my-post" });
    expect(navigate).toHaveBeenCalledWith("/posts/my-post");
  });

  it("ignores anything UniSphere did not send", () => {
    tap({ url: "/posts/my-post" });
    tap({ origin: "someone-else", url: "/posts/my-post" });
    tap(undefined);
    expect(navigate).not.toHaveBeenCalled();
  });

  it.each(["https://evil.example/x", "//evil.example", "javascript:alert(1)", "/a\\b", undefined])("never leaves this site: %s opens the notifications page", (url) => {
    tap({ origin: "unisphere", url });
    expect(navigate).toHaveBeenCalledWith("/notifications");
  });
});

describe("the turn-on pop-up", () => {
  it("is offered at first, then waits, and stops for good once the member decides", async () => {
    expect(await push.getNativePushNudge()).toBe("ask");
    push.recordNativePushNudge();
    expect(await push.getNativePushNudge()).toBeNull(); // the next one is days away
    expect(JSON.parse(store.get("unisphere:native-push-nudge"))).toMatchObject({ count: 1, never: false });

    push.silenceNativePushNudges();
    expect(JSON.parse(store.get("unisphere:native-push-nudge")).never).toBe(true);
    expect(await push.getNativePushNudge()).toBeNull();
  });

  it("explains the phone's settings once Android has stopped asking", async () => {
    h.permission = "denied";
    expect(await push.getNativePushNudge()).toBe("settings");
  });

  it("is not offered when notifications are already on", async () => {
    await push.enableNativePush();
    expect(await push.getNativePushNudge()).toBeNull();
  });

  it("is never offered on the website", async () => {
    vi.stubGlobal("window", {});
    expect(await push.getNativePushNudge()).toBeNull();
  });
});

describe("opening the phone's notification settings", () => {
  it("opens this app's notification page and remembers the member went there, once", async () => {
    expect(await push.openNativeNotificationSettings()).toBe(true);
    expect(h.calls).toContain("settings:app_notification");
    expect(push.consumeSettingsReturn()).toBe(true);
    expect(push.consumeSettingsReturn()).toBe(false);
  });

  it("reports failure, and does not pretend the member left, when the phone cannot open it", async () => {
    h.settingsFails = true;
    expect(await push.openNativeNotificationSettings()).toBe(false);
    expect(push.consumeSettingsReturn()).toBe(false);
  });
});
