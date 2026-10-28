import "server-only";
import { createClient } from "@/lib/supabase/server";
import { dbError, fail, ok } from "@/lib/actions/result";
import { IN_APP_ONLY_CATEGORIES, NOTIFICATION_CATEGORIES } from "@/lib/notification-text";
import { safeCursor } from "@/lib/cursor";

const EMAIL_DEFAULT = new Set(["projects", "mentorship", "moderation", "events"]);

export async function listNotifications({ userId, cursor = null, limit = 20, category = null }) {
  const supabase = await createClient();
  let q = supabase
    .from("notifications")
    .select("id, type, category, actor_id, entity_type, entity_id, data, read_at, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);
  if (category) q = q.eq("category", category);
  const at = safeCursor(cursor);
  if (at) q = q.or(`created_at.lt.${at.ts},and(created_at.eq.${at.ts},id.lt.${at.id})`);
  const { data } = await q;
  const rows = data ?? [];
  const page = rows.slice(0, limit);

  const actorIds = [...new Set(page.map((n) => n.actor_id).filter(Boolean))];
  const { data: actors } = actorIds.length ? await supabase.from("profiles").select("id, full_name, username, avatar_key").in("id", actorIds) : { data: [] };
  const byId = new Map((actors ?? []).map((a) => [a.id, a]));
  const last = page[page.length - 1];
  return {
    items: page.map((n) => ({ ...n, actor: byId.get(n.actor_id) ?? null })),
    nextCursor: rows.length > limit && last ? { ts: last.created_at, id: last.id } : null,
  };
}

export async function getUnreadCounts() {
  const supabase = await createClient();
  // Three independent reads, issued together: they used to be two round trips in sequence.
  const [notif, msgs, messageNotifsRes] = await Promise.all([
    supabase.rpc("unread_notification_count"),
    supabase.rpc("unread_message_counts"),
    // Message notifications are surfaced on the Messages item, so the bell excludes them.
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("type", "message").is("read_at", null),
  ]);
  const messages = (msgs.data ?? []).reduce((sum, r) => sum + Number(r.unread), 0);
  const messageNotifs = messageNotifsRes.count;
  return { notifications: Math.max(0, (notif.data ?? 0) - (messageNotifs ?? 0)), messages };
}

export async function markRead(id) {
  const { error } = await (await createClient()).rpc("mark_notification_read", { p_id: id });
  return error ? dbError(error) : ok();
}

export async function markAllRead(category = null) {
  const { data, error } = await (await createClient()).rpc("mark_all_notifications_read", { p_category: category });
  return error ? dbError(error) : ok({ count: data });
}

// A column the database does not have yet (migration 0063 not applied): Postgres says 42703, PostgREST PGRST204. Until it is, the Push
// switch is not stored, and everything else keeps working.
const isMissingColumn = (error) => Boolean(error) && (error.code === "42703" || error.code === "PGRST204" || /column .*push/i.test(String(error.message)));

/** Stored rows merged with defaults, one entry per category. */
export async function getPreferences(userId) {
  const supabase = await createClient();
  let { data, error } = await supabase.from("notification_preferences").select("category, in_app, email, push").eq("user_id", userId);
  if (isMissingColumn(error)) ({ data } = await supabase.from("notification_preferences").select("category, in_app, email").eq("user_id", userId));
  const byCat = new Map((data ?? []).map((r) => [r.category, r]));
  return NOTIFICATION_CATEGORIES.map((c) => ({
    ...c,
    in_app: c.value === "moderation" ? true : (byCat.get(c.value)?.in_app ?? true),
    email: byCat.get(c.value)?.email ?? EMAIL_DEFAULT.has(c.value),
    // "Offers & invitations" are never pushed, so its switch is shown as off rather than as a promise.
    push: IN_APP_ONLY_CATEGORIES.has(c.value) ? false : (byCat.get(c.value)?.push ?? true),
  }));
}

export async function savePreferences(userId, prefs) {
  const valid = new Set(NOTIFICATION_CATEGORIES.map((c) => c.value));
  const rows = prefs
    .filter((p) => valid.has(p.category))
    .map((p) => ({
      user_id: userId,
      category: p.category,
      in_app: p.category === "moderation" ? true : Boolean(p.in_app),
      email: IN_APP_ONLY_CATEGORIES.has(p.category) ? false : Boolean(p.email),
      // A missing value (an older form) leaves the switch on, as it is for a member who never opened this screen.
      push: IN_APP_ONLY_CATEGORIES.has(p.category) ? false : p.push !== false,
      updated_at: new Date().toISOString(),
    }));
  if (!rows.length) return fail("Nothing to save.");
  const supabase = await createClient();
  // update-then-insert per category: users may only change in_app/email/push (column grants)
  for (const row of rows) {
    const switches = { in_app: row.in_app, email: row.email, push: row.push };
    const update = (values) => supabase.from("notification_preferences").update({ ...values, updated_at: row.updated_at }).eq("user_id", userId).eq("category", row.category).select("category");
    let values = switches;
    let { data, error } = await update(values);
    if (isMissingColumn(error)) {
      values = { in_app: row.in_app, email: row.email };
      ({ data, error } = await update(values));
    }
    if (error) return dbError(error);
    if (!data?.length) {
      const { error: insError } = await supabase.from("notification_preferences").insert({ user_id: userId, category: row.category, ...values });
      if (insError) return dbError(insError);
    }
  }
  return ok({ message: "Notification preferences saved." });
}
