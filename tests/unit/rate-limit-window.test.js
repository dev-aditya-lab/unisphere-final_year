import { afterEach, describe, expect, it, vi } from "vitest";

// No Redis here: the in-process fallback is the code under test (Redis is exercised by the e2e run against a real server).
vi.mock("@/lib/redis", () => ({ getRedis: () => null }));
vi.mock("@/lib/env", () => ({ getEnv: () => ({ NODE_ENV: "production", RATE_LIMIT_MULTIPLIER: 50, TRUSTED_PROXY_HOPS: 1 }) }));

const { rateLimit, enforceRateLimit } = await import("@/lib/rate-limit");
const unique = () => `t:${Math.random().toString(36).slice(2)}`;

afterEach(() => vi.useRealTimers());

describe("rateLimit (fixed window)", () => {
  it("allows up to the limit, then refuses with the time left", async () => {
    const key = unique();
    for (let i = 0; i < 3; i++) expect((await rateLimit({ key, limit: 3, windowSec: 60 })).ok).toBe(true);
    const over = await rateLimit({ key, limit: 3, windowSec: 60 });
    expect(over.ok).toBe(false);
    expect(over.remaining).toBe(0);
    expect(over.resetSec).toBeGreaterThan(0);
    expect(over.resetSec).toBeLessThanOrEqual(60);
  });

  it("keeps identities apart, so one noisy caller cannot lock another out", async () => {
    const a = unique();
    const b = unique();
    for (let i = 0; i < 5; i++) await rateLimit({ key: a, limit: 2, windowSec: 60 });
    expect((await rateLimit({ key: a, limit: 2, windowSec: 60 })).ok).toBe(false);
    expect((await rateLimit({ key: b, limit: 2, windowSec: 60 })).ok).toBe(true);
  });

  it("starts a new window when the old one has passed", async () => {
    vi.useFakeTimers();
    const key = unique();
    await rateLimit({ key, limit: 1, windowSec: 10 });
    expect((await rateLimit({ key, limit: 1, windowSec: 10 })).ok).toBe(false);
    vi.advanceTimersByTime(11_000);
    expect((await rateLimit({ key, limit: 1, windowSec: 10 })).ok).toBe(true);
  });

  it("ignores the test-only multiplier in production", async () => {
    const key = unique();
    await rateLimit({ key, limit: 1, windowSec: 60 });
    expect((await rateLimit({ key, limit: 1, windowSec: 60 })).ok).toBe(false); // with a x50 multiplier this would still pass
  });
});

describe("enforceRateLimit", () => {
  it("returns null while allowed and a ready-made failure once over", async () => {
    const id = unique();
    expect(await enforceRateLimit("login", id, { limit: 1, windowSec: 60 })).toBeNull();
    expect(await enforceRateLimit("login", id, { limit: 1, windowSec: 60 })).toMatchObject({ ok: false, code: "rate_limited", error: expect.stringMatching(/try again in/i) });
  });

  it("separates actions that share an identity", async () => {
    const id = unique();
    await enforceRateLimit("a", id, { limit: 1, windowSec: 60 });
    expect(await enforceRateLimit("b", id, { limit: 1, windowSec: 60 })).toBeNull();
  });
});
