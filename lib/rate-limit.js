import "server-only";
import { headers } from "next/headers";
import { getRedis } from "@/lib/redis";
import { getEnv } from "@/lib/env";

// KEYS[1] counter, ARGV[1] window in seconds. A key that somehow lost its expiry gets one again.
const WINDOW_SCRIPT = `
local c = redis.call('INCR', KEYS[1])
local t = redis.call('TTL', KEYS[1])
if c == 1 or t < 0 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
  t = tonumber(ARGV[1])
end
return {c, t}
`;

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
      // One round trip and atomic: increment, start the window on the first hit, and read what is left of it.
      // (This used to be INCR, then EXPIRE, then TTL: two or three sequential network round trips.)
      const [count, ttl] = await redis.eval(WINDOW_SCRIPT, 1, `rl:${key}`, windowSec);
      return { ok: count <= limit, remaining: Math.max(0, limit - count), resetSec: Math.max(ttl, 1), backend: "redis" };
    } catch {
      // fall through to memory
    }
  }
  const { count, resetSec } = memoryHit(key, windowSec);
  return { ok: count <= limit, remaining: Math.max(0, limit - count), resetSec, backend: "memory" };
}

/**
 * The caller's address as seen by the nearest trusted reverse proxy.
 *
 * `X-Forwarded-For` is a list that every proxy appends to, and a client can send its own value first, so the LEFT-most
 * entry is attacker-controlled (rotating it would reset every per-IP limit). Only the entries added by proxies we run
 * or rent can be trusted, and those are at the RIGHT: with `TRUSTED_PROXY_HOPS` proxies in front of the app (default 1:
 * Vercel, Render's load balancer, Caddy or Nginx), the client is that many entries from the end. Set 2 when Cloudflare
 * sits in front of one more proxy. Count wrongly and per-IP limits either lump visitors together (too few hops: a proxy's address is used)
 * or can be dodged (too many: a client-supplied value is used).
 */
export function clientIpFrom(forwardedFor, realIp, hops = 1) {
  hops = Math.max(1, hops);
  const chain = String(forwardedFor ?? "").split(",").map((v) => v.trim()).filter(Boolean);
  if (chain.length) return chain[Math.max(0, chain.length - hops)].slice(0, 64);
  return String(realIp ?? "").trim().slice(0, 64) || "unknown";
}

export async function getClientIp() {
  const h = await headers();
  return clientIpFrom(h.get("x-forwarded-for"), h.get("x-real-ip"), getEnv().TRUSTED_PROXY_HOPS);
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
