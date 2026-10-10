import "server-only";
import webpush from "web-push";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEnv, getIntegrations } from "@/lib/env";
import { describeNotification } from "@/lib/notification-text";
import { fail, ok } from "@/lib/actions/result";

/**
 * Web Push. A member opts in on each device; the worker pushes new unread in-app notifications, so the bell's
 * per-category preferences and blocks apply to push as well. Lock-screen text never includes message bodies.
 */
const MAX_DEVICES = 10;
const MAX_FAILURES = 5;
let configured = false;

function ensureConfigured() {
  if (!getIntegrations().push) return false;
  if (!configured) {
    const e = getEnv();
    webpush.setVapidDetails(e.VAPID_SUBJECT, e.NEXT_PUBLIC_VAPID_PUBLIC_KEY, e.VAPID_PRIVATE_KEY);
    configured = true;
  }
  return true;
}

/** Validates the subscription JSON a browser produced. Only https push-service endpoints are accepted. */
export function parseSubscription(input) {
  const endpoint = input?.endpoint;
  const p256dh = input?.keys?.p256dh;
  const auth = input?.keys?.auth;
  if (typeof endpoint !== "string" || !endpoint.startsWith("https://") || endpoint.length > 1200) return null;
  if (typeof p256dh !== "string" || typeof auth !== "string" || p256dh.length > 200 || auth.length > 100) return null;
  return { endpoint, p256dh, auth };
}

export async function saveSubscription({ userId, subscription, userAgent }) {
  const sub = parseSubscription(subscription);
  if (!sub) return fail("That subscription is not valid.", { code: "invalid" });
  const admin = createAdminClient();
  // An endpoint belongs to one browser profile: if someone else was signed in there, it now belongs to this member.
  const { error } = await admin.from("push_subscriptions").upsert(
    { user_id: userId, endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth, user_agent: userAgent?.slice(0, 200) ?? null, failure_count: 0 },
    { onConflict: "endpoint" },
  );
  if (error) return fail("Could not turn on notifications on this device.", { code: "db_error" });
  const { data: mine } = await admin.from("push_subscriptions").select("id").eq("user_id", userId).order("created_at", { ascending: false });
  const extra = (mine ?? []).slice(MAX_DEVICES).map((r) => r.id);
  if (extra.length) await admin.from("push_subscriptions").delete().in("id", extra);
  return ok();
}

export async function removeSubscription({ endpoint }) {
  if (typeof endpoint !== "string") return fail("Invalid request.");
  await (await createClient()).from("push_subscriptions").delete().eq("endpoint", endpoint); // RLS: own devices only
  return ok();
}

export async function listDevices() {
  const { data } = await (await createClient()).from("push_subscriptions").select("id, user_agent, created_at, last_success_at").order("created_at", { ascending: false });
  return data ?? [];
}

async function deliver(admin, sub, payload) {
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), { TTL: 3600, urgency: "normal" });
    await admin.from("push_subscriptions").update({ last_success_at: new Date().toISOString(), failure_count: 0 }).eq("id", sub.id);
    return true;
  } catch (err) {
    const status = err?.statusCode;
    if (status === 404 || status === 410) {
      await admin.from("push_subscriptions").delete().eq("id", sub.id); // the device unsubscribed or was reset
    } else {
      const failures = (sub.failure_count ?? 0) + 1;
      if (failures >= MAX_FAILURES) await admin.from("push_subscriptions").delete().eq("id", sub.id);
      else await admin.from("push_subscriptions").update({ failure_count: failures }).eq("id", sub.id);
      console.error("[push] delivery failed:", status ?? err?.message);
    }
    return false;
  }
}

async function sendToUser(admin, userId, payload) {
  const { data: subs } = await admin.from("push_subscriptions").select("id, endpoint, p256dh, auth, failure_count").eq("user_id", userId);
  let delivered = 0;
  for (const sub of subs ?? []) if (await deliver(admin, sub, payload)) delivered += 1;
  return { devices: subs?.length ?? 0, delivered };
}

export async function sendTestPush(userId) {
  if (!ensureConfigured()) return fail("Push notifications are not set up on this server.", { code: "not_configured" });
  const res = await sendToUser(createAdminClient(), userId, {
    title: "Notifications are on",
    body: "You will see updates from UniSphere here, even when the app is closed.",
    url: "/settings/notifications",
    tag: "push-test",
  });
  if (res.devices === 0) return fail("No device is subscribed yet.", { code: "no_devices" });
  return res.delivered > 0 ? ok(res) : fail("The test could not be delivered. Try turning notifications off and on again.", { code: "delivery_failed" });
}

/** The lock-screen version of a notification: text only, no message bodies, no snippets of private content. */
function toPayload(n) {
  const { text, href } = describeNotification({ type: n.type, data: n.data, entity_id: n.entity_id }, n.actor_name);
  return { title: "UniSphere", body: text, url: href ?? "/notifications", tag: `${n.type}:${n.entity_id ?? n.id}` };
}

/** Worker step: push each member's newly created unread notifications (one summary push if there are many). */
export async function processPushNotifications({ limit = 100 } = {}) {
  if (!ensureConfigured()) return { skipped: "push not configured" };
  const admin = createAdminClient();
  const { data: rows, error } = await admin.rpc("claim_push_notifications", { p_limit: limit });
  if (error) return { error: error.message };
  const byUser = new Map();
  for (const n of rows ?? []) byUser.set(n.user_id, [...(byUser.get(n.user_id) ?? []), n]);
  let pushed = 0;
  for (const [userId, items] of byUser) {
    const payloads = items.length > 3
      ? [{ title: "UniSphere", body: `You have ${items.length} new notifications`, url: "/notifications", tag: "digest" }]
      : items.map(toPayload);
    for (const p of payloads) pushed += (await sendToUser(admin, userId, p)).delivered;
  }
  return { claimed: rows?.length ?? 0, pushed };
}
