import "server-only";
import Redis from "ioredis";
import { getEnv } from "@/lib/env";

/**
 * Redis is an optimisation layer (rate limits, cache, throttling). PostgreSQL is the
 * source of truth. All helpers degrade gracefully when Redis is absent or down.
 */
const globalForRedis = globalThis;

function create() {
  const url = getEnv().REDIS_URL;
  if (!url) return null;
  const client = new Redis(url, {
    // Shared Redis instance: namespace every key so we never collide with other apps.
    keyPrefix: "unisphere:",
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 2000,
    retryStrategy: (times) => (times > 5 ? null : Math.min(times * 500, 5000)),
  });
  let warned = false;
  client.on("error", (err) => {
    if (!warned) {
      warned = true;
      console.warn(`[redis] unavailable (${err.code || err.message}); falling back to in-memory behaviour`);
    }
  });
  client.on("ready", () => {
    warned = false;
  });
  client.connect().catch(() => {});
  return client;
}

/** Returns a ready client, or null when Redis is not configured / not reachable. */
export function getRedis() {
  if (globalForRedis.__unisphereRedis === undefined) {
    globalForRedis.__unisphereRedis = create();
  }
  const client = globalForRedis.__unisphereRedis;
  return client && client.status === "ready" ? client : null;
}

export async function cacheGetJson(key) {
  const r = getRedis();
  if (!r) return null;
  try {
    const raw = await r.get(`cache:${key}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function cacheSetJson(key, value, ttlSec) {
  const r = getRedis();
  if (!r) return false;
  try {
    await r.set(`cache:${key}`, JSON.stringify(value), "EX", ttlSec);
    return true;
  } catch {
    return false;
  }
}

export async function cacheDelete(...keys) {
  const r = getRedis();
  if (!r || keys.length === 0) return;
  try {
    await r.del(...keys.map((k) => `cache:${k}`));
  } catch {
    /* non-critical */
  }
}
