import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { cacheGetJson, cacheSetJson, cacheDelete } from "@/lib/redis";

/**
 * Runtime settings and feature flags (PostgreSQL is the source of truth).
 * Reads go through three layers, nearest first:
 *   1. per-request memoisation (React `cache`)
 *   2. a short in-process copy (L1): no network at all. Every signed-in page reads the flags, and a Redis GET is a
 *      network round trip (hundreds of milliseconds when Redis is in another region), so without this each request
 *      waited on Redis before it could even start its database reads.
 *   3. Redis (shared across instances), then PostgreSQL.
 * An administrator's change clears Redis and the L1 copy of the instance that handled it immediately; other
 * instances pick it up within L1_TTL_MS.
 */

const SETTINGS_KEY = "settings:all";
const FLAGS_KEY = "flags:all";
const TTL_SEC = 30;
// Off outside production: a developer (or an end-to-end test) who flips a flag expects to see it at once. Concurrent
// readers still share one load either way.
const L1_TTL_MS = Number(process.env.SETTINGS_L1_TTL_MS ?? (process.env.NODE_ENV === "production" ? 10_000 : 0));

// After L1_TTL_MS a value is "stale": it is still served at once while a refresh runs in the background, so no
// request ever waits on Redis just because the window rolled over. Past L1_STALE_MS it is too old to serve.
const L1_STALE_MS = L1_TTL_MS * 6;

// key -> { value, at, refreshing } for settled values, or { promise } while the first load is in flight (so a burst
// of requests shares one load instead of each going to Redis / the database).
const l1 = new Map();

function refresh(key, load) {
  const entry = l1.get(key);
  if (entry) entry.refreshing = true;
  load().then(
    (value) => l1.set(key, { value, at: Date.now() }),
    () => {
      const current = l1.get(key);
      if (current) current.refreshing = false; // keep serving the stale copy; try again on the next read
    },
  );
}

async function layered(key, load) {
  const hit = l1.get(key);
  if (hit?.promise) return hit.promise;
  if (hit && L1_TTL_MS > 0) {
    const age = Date.now() - hit.at;
    if (age < L1_TTL_MS) return hit.value;
    if (age < L1_STALE_MS) {
      if (!hit.refreshing) refresh(key, load);
      return hit.value;
    }
  }
  const promise = load().then(
    (value) => {
      l1.set(key, { value, at: Date.now() });
      return value;
    },
    (err) => {
      l1.delete(key);
      throw err;
    },
  );
  l1.set(key, { promise });
  return promise;
}

export const DEFAULT_SETTINGS = {
  platform_name: "UniSphere",
  platform_tagline: "Your campus. Your people. Your next idea.",
  maintenance_mode: false,
  maintenance_message: "UniSphere is undergoing scheduled maintenance. Please check back shortly.",
  registration_open: true,
  support_email: "",
  upload_max_image_mb: 5,
  upload_max_attachment_mb: 10,
  upload_allowed_image_types: ["image/jpeg", "image/png", "image/webp"],
  rate_limits: {
    auth: { limit: 10, windowSec: 300 },
    write: { limit: 60, windowSec: 60 },
    search: { limit: 60, windowSec: 60 },
    upload: { limit: 20, windowSec: 300 },
    ai: { limit: 20, windowSec: 300 },
  },
  ai_daily_limit_per_user: 30,
  ai_share_college_content: true,
  guidelines_md: "",
  privacy_md: "",
  terms_md: "",
};

async function loadSettingsUncached() {
  const cached = await cacheGetJson(SETTINGS_KEY);
  if (cached) return cached;
  const { data, error } = await createAdminClient().from("system_settings").select("key, value");
  if (error) {
    console.error("[settings] failed to load, using defaults:", error.message);
    return { ...DEFAULT_SETTINGS };
  }
  const merged = { ...DEFAULT_SETTINGS };
  for (const row of data) merged[row.key] = row.value;
  await cacheSetJson(SETTINGS_KEY, merged, TTL_SEC);
  return merged;
}

async function loadFlagsUncached() {
  const cached = await cacheGetJson(FLAGS_KEY);
  if (cached) return cached;
  const { data, error } = await createAdminClient().from("feature_flags").select("key, enabled");
  if (error) {
    console.error("[flags] failed to load:", error.message);
    return {};
  }
  const flags = Object.fromEntries(data.map((r) => [r.key, r.enabled]));
  await cacheSetJson(FLAGS_KEY, flags, TTL_SEC);
  return flags;
}

export const getSettings = cache(() => layered(SETTINGS_KEY, loadSettingsUncached));
export const getFlags = cache(() => layered(FLAGS_KEY, loadFlagsUncached));

export async function getSetting(key) {
  const settings = await getSettings();
  return settings[key];
}

/** Settings that are safe to render for anonymous visitors. */
export async function getPublicSettings() {
  const s = await getSettings();
  return {
    platform_name: s.platform_name,
    platform_tagline: s.platform_tagline,
    maintenance_mode: s.maintenance_mode,
    maintenance_message: s.maintenance_message,
    registration_open: s.registration_open,
    support_email: s.support_email,
  };
}

export async function isFlagEnabled(key) {
  const flags = await getFlags();
  // Unknown flags are treated as disabled so a typo can never silently enable a feature.
  return flags[key] === true;
}

export async function invalidateSettingsCache() {
  l1.clear();
  await cacheDelete(SETTINGS_KEY, FLAGS_KEY);
}
