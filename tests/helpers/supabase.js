import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PUBLISHABLE = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SECRET = process.env.SUPABASE_SECRET_KEY;

export const GREENFIELD = "00000000-0000-4000-8000-000000000001";
export const RIVERSIDE = "00000000-0000-4000-8000-000000000002";
export const PASSWORD = "Passw0rd!test-xyz";

const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

/** Service-role client (bypasses RLS): test setup and assertions about stored state only. */
export const admin = createClient(URL, SECRET, noSession);

/** Anonymous client: what a logged-out visitor can do. */
export const anon = () => createClient(URL, PUBLISHABLE, noSession);

const created = [];

/** Creates a confirmed auth user (and, via trigger, its profile) and returns a client signed in as them. */
export async function createUser(label, { accountType = "student", collegeId = GREENFIELD, visibility } = {}) {
  // accountType: null / collegeId: null model someone who joined without saying either.
  const email = `${label}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: `Test ${label}`, ...(accountType ? { account_type: accountType } : {}) },
  });
  if (error) throw error;
  const id = data.user.id;
  created.push(id);

  const patch = { college_id: collegeId ?? null, onboarded_at: new Date().toISOString() };
  if (visibility) patch.visibility = visibility;
  const { error: updError } = await admin.from("profiles").update(patch).eq("id", id);
  if (updError) throw updError;

  const client = createClient(URL, PUBLISHABLE, noSession);
  const { error: signInError } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (signInError) throw signInError;
  const { data: profile } = await admin.from("profiles").select("username").eq("id", id).single();
  return { id, email, client, username: profile.username };
}

export async function grantRoleDirect(userId, role, collegeId = null) {
  const { error } = await admin.from("user_roles").insert({ user_id: userId, role, college_id: collegeId });
  if (error) throw error;
}

export async function cleanupUsers() {
  for (const id of created.splice(0)) {
    await admin.auth.admin.deleteUser(id);
  }
}

export async function setSetting(key, value) {
  const { error } = await admin.from("system_settings").update({ value }).eq("key", key);
  if (error) throw error;
  await dropSettingsCache();
}

/** The app caches settings in Redis for 30 s; a test that edits the table directly must drop that cache too. */
async function dropSettingsCache() {
  if (!process.env.REDIS_URL) return;
  try {
    const { default: Redis } = await import("ioredis");
    const redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1, lazyConnect: true });
    await redis.connect();
    await redis.del("unisphere:cache:settings:all", "unisphere:cache:flags:all");
    redis.disconnect();
  } catch {
    /* no Redis: the app has no shared cache to drop */
  }
}
