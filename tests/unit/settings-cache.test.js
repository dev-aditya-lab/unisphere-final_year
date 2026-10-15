import { beforeEach, describe, expect, it, vi } from "vitest";

// React's per-request `cache` is a server-only API; here every call should run, so the L1 layer is what is tested.
vi.mock("react", () => ({ cache: (fn) => fn }));

const state = { redisGets: 0, redisValue: null, dbReads: 0, deletes: [] };
vi.mock("@/lib/redis", () => ({
  cacheGetJson: async () => {
    state.redisGets += 1;
    return state.redisValue;
  },
  cacheSetJson: async () => true,
  cacheDelete: async (...keys) => void state.deletes.push(...keys),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: async () => {
        state.dbReads += 1;
        return { data: [{ key: "events", enabled: true }], error: null };
      },
    }),
  }),
}));

let settings;
beforeEach(async () => {
  state.redisGets = 0;
  state.redisValue = null;
  state.dbReads = 0;
  state.deletes = [];
  vi.resetModules();
  vi.useRealTimers();
  vi.stubEnv("NODE_ENV", "production"); // the in-memory window is on in production only
  settings = await import("@/lib/settings");
});

describe("feature flag reads", () => {
  it("hit Redis or the database once, then serve from memory", async () => {
    expect(await settings.isFlagEnabled("events")).toBe(true);
    expect(await settings.isFlagEnabled("events")).toBe(true);
    expect(await settings.isFlagEnabled("events")).toBe(true);
    expect(state.redisGets).toBe(1);
    expect(state.dbReads).toBe(1);
  });

  it("share one load between concurrent callers", async () => {
    await Promise.all(Array.from({ length: 12 }, () => settings.getFlags()));
    expect(state.redisGets).toBe(1);
    expect(state.dbReads).toBe(1);
  });

  it("treat unknown flags as disabled", async () => {
    expect(await settings.isFlagEnabled("not-a-flag")).toBe(false);
  });

  it("keep serving the old value while refreshing in the background once the window passes", async () => {
    vi.useFakeTimers();
    state.redisValue = { events: true };
    expect(await settings.isFlagEnabled("events")).toBe(true);
    vi.advanceTimersByTime(9_000);
    await settings.getFlags();
    expect(state.redisGets).toBe(1); // still inside the window

    state.redisValue = { events: false }; // an administrator turned it off
    vi.advanceTimersByTime(2_000);
    expect(await settings.isFlagEnabled("events")).toBe(true); // stale answer returned immediately...
    await vi.advanceTimersByTimeAsync(0);
    expect(state.redisGets).toBe(2); // ...while one refresh ran
    expect(await settings.isFlagEnabled("events")).toBe(false); // and the next read has the new value
  });

  it("does not serve a value older than the stale limit", async () => {
    vi.useFakeTimers();
    state.redisValue = { events: true };
    await settings.getFlags();
    state.redisValue = { events: false };
    vi.advanceTimersByTime(61_000);
    expect(await settings.isFlagEnabled("events")).toBe(false);
  });

  it("are re-read at once after an administrator changes them", async () => {
    await settings.getFlags();
    await settings.invalidateSettingsCache();
    expect(state.deletes).toEqual(["settings:all", "flags:all"]);
    await settings.getFlags();
    expect(state.redisGets).toBe(2);
  });
});
