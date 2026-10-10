import "server-only";
import { headers } from "next/headers";
import { getRedis } from "@/lib/redis";
import { getEnv } from "@/lib/env";

// Per-process fallback used when Redis is not configured or unreachable.
const memory = new Map();

function memoryHit(key, windowSec) {
  const now = Date.now();
  const entry = memory.get(key);
  if (!entry || entry.resetAt <= now) {
    memory.set(key, { count: 1, resetAt: now + windowSec * 1000 });
    if (memory.size > 5000) {
      for (const [k, v] of memory) if (v.resetAt <= now) memory.delete(k);
    }
    return { count: 1, resetSec: windowSec };
  }
  entry.count += 1;
  return { count: entry.count, resetSec: Math.ceil((entry.resetAt - now) / 1000) };
}

/**
 * Fixed-window rate limiter.
 * @returns {{ ok: boolean, remaining: number, resetSec: number, backend: 'redis'|'memory' }}
 */
export async function rateLimit({ key, limit: baseLimit, windowSec }) {
  const env = getEnv();
  const limit = env.NODE_ENV === "production" ? baseLimit : baseLimit * env.RATE_LIMIT_MULTIPLIER;
  const redis = getRedis();
  if (redis) {
    try {
      const redisKey = `rl:${key}`;
      const count = await redis.incr(redisKey);
      if (count === 1) await redis.expire(redisKey, windowSec);
      const ttl = count === 1 ? windowSec : await redis.ttl(redisKey);
      return { ok: count <= limit, remaining: Math.max(0, limit - count), resetSec: Math.max(ttl, 1), backend: "redis" };
    } catch {
      // fall through to memory
    }
  }
  const { count, resetSec } = memoryHit(key, windowSec);
  return { ok: count <= limit, remaining: Math.max(0, limit - count), resetSec, backend: "memory" };
}

export async function getClientIp() {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return h.get("x-real-ip") || "unknown";
}

function formatWait(sec) {
  if (sec < 60) return `${sec} seconds`;
  const m = Math.ceil(sec / 60);
  return `${m} minute${m === 1 ? "" : "s"}`;
}

/** Returns a ready-made failure result when the caller is over the limit, otherwise null. */
export async function enforceRateLimit(scope, identity, { limit, windowSec }) {
  const result = await rateLimit({ key: `${scope}:${identity}`, limit, windowSec });
  if (result.ok) return null;
  return {
    ok: false,
    code: "rate_limited",
    error: `Too many attempts. Please try again in ${formatWait(result.resetSec)}.`,
  };
}
