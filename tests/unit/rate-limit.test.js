import { beforeEach, describe, expect, it, vi } from "vitest";

// A tiny in-memory stand-in for the one Redis command the limiter uses, with the same return shape.
const counters = new Map();
const calls = [];
const fakeRedis = {
  status: "ready",
  async eval(script, numKeys, key, windowSec) {
    calls.push({ key, windowSec });
    const now = Date.now();
    let entry = counters.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + Number(windowSec) * 1000 };
      counters.set(key, entry);
    }
    entry.count += 1;
    return [entry.count, Math.ceil((entry.resetAt - now) / 1000)];
  },
};

vi.mock("@/lib/redis", () => ({ getRedis: () => fakeRedis }));
vi.mock("@/lib/env", () => ({ getEnv: () => ({ NODE_ENV: "production", RATE_LIMIT_MULTIPLIER: 1 }) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

const { rateLimit, enforceRateLimit } = await import("@/lib/rate-limit");

beforeEach(() => {
  counters.clear();
  calls.length = 0;
});

describe("rateLimit (Redis path)", () => {
  it("counts hits in one round trip and refuses after the limit", async () => {
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await rateLimit({ key: "t:1", limit: 3, windowSec: 60 }));
    expect(results.map((r) => r.ok)).toEqual([true, true, true, false]);
    expect(results[0].remaining).toBe(2);
    expect(results[3].remaining).toBe(0);
    expect(results[0].backend).toBe("redis");
    expect(calls).toHaveLength(4); // exactly one Redis call per check
  });

  it("keeps separate counters per key", async () => {
    await rateLimit({ key: "a", limit: 1, windowSec: 60 });
    expect((await rateLimit({ key: "b", limit: 1, windowSec: 60 })).ok).toBe(true);
    expect((await rateLimit({ key: "a", limit: 1, windowSec: 60 })).ok).toBe(false);
  });

  it("reports how long to wait in the user-facing error", async () => {
    await enforceRateLimit("login", "x", { limit: 1, windowSec: 120 });
    const res = await enforceRateLimit("login", "x", { limit: 1, windowSec: 120 });
    expect(res).toMatchObject({ ok: false, code: "rate_limited" });
    expect(res.error).toMatch(/2 minutes/);
  });
});
