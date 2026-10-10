import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { cacheGetJson, cacheSetJson, cacheDelete } from "@/lib/redis";

/**
 * Runtime settings and feature flags (PostgreSQL is the source of truth).
 * Reads are cached briefly (Redis when available + per-request memoisation);
 * the cache is invalidated whenever an administrator changes a value.
 */

const SETTINGS_KEY = "settings:all";
const FLAGS_KEY = "flags:all";
const TTL_SEC = 30;

export const DEFAULT_SETTINGS = {
  platform_name: "UniSphere",
  platform_tagline: "Your campus. Your people. Your next idea.",
  maintenance_mode: false,
  maintenance_message: "UniSphere is undergoing scheduled maintenance. Please check back shortly.",
  registration_open: true,
  college_verification_required: false,
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

async function loadSettings() {
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

async function loadFlags() {
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

export const getSettings = cache(loadSettings);
export const getFlags = cache(loadFlags);

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
    college_verification_required: s.college_verification_required,
    support_email: s.support_email,
  };
}

export async function isFlagEnabled(key) {
  const flags = await getFlags();
  // Unknown flags are treated as disabled so a typo can never silently enable a feature.
  return flags[key] === true;
}

export async function invalidateSettingsCache() {
  await cacheDelete(SETTINGS_KEY, FLAGS_KEY);
}
