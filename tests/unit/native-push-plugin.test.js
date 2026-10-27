import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// How Capacitor really builds a plugin (node_modules/@capacitor/core/dist/index.js): a Proxy that answers EVERY property, `then`
// included. A plugin that is returned from an async function or awaited is therefore taken for a promise; JavaScript calls its
// `then`, Capacitor sends that to the phone as a method that does not exist, and the resolve callback is never called, so the
// call hangs for ever. This once left Settings > Notifications on "Checking…". The fake below behaves the same way.
const state = { permission: "granted", hang: false, calls: [] };
vi.mock("@capacitor/push-notifications", () => {
  const method = (name) => (...args) => {
    if (name === "then") return new Promise(() => {}); // the resolve callback in args[0] is never called, as in Capacitor
    state.calls.push(name);
    if (name === "checkPermissions" && state.hang) return new Promise(() => {}); // the phone never answers
    return Promise.resolve(name === "checkPermissions" || name === "requestPermissions" ? { receive: state.permission } : undefined);
  };
  const PushNotifications = new Proxy({}, { get: (_, prop) => (prop === "addListener" ? async () => ({ remove() {} }) : method(String(prop))) });
  return { PushNotifications };
});

const push = await import("@/lib/native/push");

/** Resolves { value } when the promise finishes, or { hung: true } if it has not within a second. */
const settles = (promise) => Promise.race([promise.then((value) => ({ value })), new Promise((resolve) => setTimeout(() => resolve({ hung: true }), 1000))]);

beforeEach(() => {
  Object.assign(state, { permission: "granted", hang: false, calls: [] });
  globalThis.window = { Capacitor: { isNativePlatform: () => true } };
});
afterEach(() => {
  delete globalThis.window;
  vi.useRealTimers();
});

describe("the push plugin in the Android app", () => {
  it("answers the settings screen instead of leaving it on Checking", async () => {
    const result = await settles(push.getNativePushState());
    expect(result.hung).toBeUndefined();
    expect(result.value).toEqual({ supported: true, permission: "granted", enabled: false });
  });

  it("tells a blocked phone from one that has not been asked", async () => {
    state.permission = "denied";
    expect((await settles(push.getNativePushState())).value).toMatchObject({ supported: true, permission: "denied" });
    state.permission = "prompt";
    expect((await settles(push.getNativePushState())).value).toMatchObject({ supported: true, permission: "prompt" });
    state.permission = "prompt-with-rationale";
    expect((await settles(push.getNativePushState())).value).toMatchObject({ permission: "prompt" });
  });

  it("starts up: creates the three notification channels and finishes", async () => {
    const result = await settles(push.initNativePush());
    expect(result.hung).toBeUndefined();
    expect(state.calls.filter((c) => c === "createChannel")).toHaveLength(3);
  });

  it("turns off (as signing out does) and discards the token with Firebase", async () => {
    const result = await settles(push.disableNativePush());
    expect(result.hung).toBeUndefined();
    expect(state.calls).toContain("unregister");
  });

  it("gives up on a phone that never answers, so the screen can offer Try again", async () => {
    state.hang = true;
    vi.useFakeTimers();
    const pending = push.getNativePushState();
    await vi.advanceTimersByTimeAsync(8100);
    expect(await pending).toEqual({ supported: false, failed: true });
  });

  it("does not touch the plugin at all on the website", async () => {
    globalThis.window = {};
    expect(await push.getNativePushState()).toEqual({ supported: false });
    expect(await push.getNativePushNudge()).toBeNull();
    expect(state.calls).toHaveLength(0);
  });
});
