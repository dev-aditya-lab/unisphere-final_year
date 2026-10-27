import "server-only";
import webpush from "web-push";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEnv, getIntegrations } from "@/lib/env";
import { describeNotification } from "@/lib/notification-text";
import { fail, ok } from "@/lib/actions/result";
import { isAllowedPushEndpoint } from "@/lib/push-endpoint";
import { parseNativeDevice } from "@/lib/push-token";
import { sendFcm } from "@/lib/services/fcm";

/**
 * Push, to two kinds of device. A member opts in on each device; the worker pushes new unread in-app notifications, so the bell's
 * per-category preferences and blocks apply to push as well. Lock-screen text never includes message bodies.
 *  - Web Push: a browser or an installed web app (a row in push_subscriptions, sent with VAPID).
 *  - The Android app: a Firebase Cloud Messaging token (a row in push_devices, sent through lib/services/fcm.js).
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

/** Validates the subscription JSON a browser produced. Only the real browser push services are accepted (no SSRF). */
export function parseSubscription(input) {
  const endpoint = input?.endpoint;
  const p256dh = input?.keys?.p256dh;
  const auth = input?.keys?.auth;
  if (typeof endpoint !== "string" || endpoint.length > 1200 || !isAllowedPushEndpoint(endpoint)) return null;
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

/** Registers the Android app on this phone. `input` is the request body: { token, platform, appVersion }. */
export async function saveDevice({ userId, input }) {
  const device = parseNativeDevice(input);
  if (!device) return fail("That device is not valid.", { code: "invalid" });
  const admin = createAdminClient();
  // A token belongs to one app install: if someone else was signed in on this phone, it now belongs to this member.
  const { error } = await admin.from("push_devices").upsert(
    { user_id: userId, platform: device.platform, token: device.token, app_version: device.appVersion, failure_count: 0, last_seen_at: new Date().toISOString() },
    { onConflict: "token" },
  );
  if (error) return fail("Could not turn on notifications on this device.", { code: "db_error" });
  const { data: mine } = await admin.from("push_devices").select("id").eq("user_id", userId).order("last_seen_at", { ascending: false });
  const extra = (mine ?? []).slice(MAX_DEVICES).map((r) => r.id);
  if (extra.length) await admin.from("push_devices").delete().in("id", extra);
  return ok();
}

export async function removeDevice({ userId, token }) {
  if (typeof token !== "string") return fail("Invalid request.");
  // The member's own client cannot match on `token` (it is not a column they may read), so the server does it, for their devices only.
  await createAdminClient().from("push_devices").delete().eq("token", token).eq("user_id", userId);
  return ok();
}

export async function listDevices() {
  const { data } = await (await createClient()).from("push_subscriptions").select("id, user_agent, created_at, last_success_at").order("created_at", { ascending: false });
  return data ?? [];
}

async function deliver(admin, sub, payload) {
  // A row stored before the allow-list existed is dropped, never called.
  if (!isAllowedPushEndpoint(sub.endpoint)) {
    await admin.from("push_subscriptions").delete().eq("id", sub.id);
    return false;
  }
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify({ ...payload, from: "unisphere" }), { TTL: 3600, urgency: "normal" });
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

async function deliverNative(admin, device, payload) {
  const res = await sendFcm(device.token, payload);
  if (res.ok) {
    await admin.from("push_devices").update({ last_success_at: new Date().toISOString(), failure_count: 0 }).eq("id", device.id);
    return true;
  }
  if (res.reason === "gone") {
    await admin.from("push_devices").delete().eq("id", device.id); // the app was uninstalled or its data cleared
  } else if (res.reason === "failed") {
    // "retry" (Google busy) and "config" (our own setting) say nothing about this device, so only a real failure is counted.
    const failures = (device.failure_count ?? 0) + 1;
    if (failures >= MAX_FAILURES) await admin.from("push_devices").delete().eq("id", device.id);
    else await admin.from("push_devices").update({ failure_count: failures }).eq("id", device.id);
  }
  return false;
}

async function sendToUser(admin, userId, payload) {
  const on = getIntegrations();
  const [web, native] = await Promise.all([
    on.push ? admin.from("push_subscriptions").select("id, endpoint, p256dh, auth, failure_count").eq("user_id", userId) : { data: [] },
    on.fcm ? admin.from("push_devices").select("id, token, failure_count").eq("user_id", userId) : { data: [] },
  ]);
  let delivered = 0;
  for (const sub of web.data ?? []) if (await deliver(admin, sub, payload)) delivered += 1;
  for (const device of native.data ?? []) if (await deliverNative(admin, device, payload)) delivered += 1;
  return { devices: (web.data?.length ?? 0) + (native.data?.length ?? 0), delivered };
}

/** Whether this server can send push to anything at all: Web Push (VAPID) set up, the Android app's Firebase key set up, or both. */
function pushAvailable() {
  const on = getIntegrations();
  if (on.push) ensureConfigured();
  return on.push || on.fcm;
}

export async function sendTestPush(userId) {
  if (!pushAvailable()) return fail("Push notifications are not set up on this server.", { code: "not_configured" });
  const res = await sendToUser(createAdminClient(), userId, {
    title: "Notifications are on",
    body: "You will see updates from UniSphere here, even when the app is closed.",
    url: "/settings/notifications",
    tag: "push-test",
    category: "updates",
    urgent: true, // the member is waiting for it: do not let the phone's battery saver hold it back
  });
  if (res.devices === 0) return fail("No device is subscribed yet.", { code: "no_devices" });
  return res.delivered > 0 ? ok(res) : fail("The test could not be delivered. Try turning notifications off and on again.", { code: "delivery_failed" });
}

/** The lock-screen version of a notification: text only, no message bodies, no snippets of private content. */
function toPayload(n) {
  const { text, href } = describeNotification({ type: n.type, data: n.data, entity_id: n.entity_id }, n.actor_name);
  // `category` only chooses the Android channel (lib/push-channels.js); the browser ignores it.
  return { title: "UniSphere", body: text, url: href ?? "/notifications", tag: `${n.type}:${n.entity_id ?? n.id}`, category: n.category };
}

const STALE_DEVICE_DAYS = 90;
let lastPurge = 0;

/**
 * Drops Android devices whose app has not started with notifications on for 90 days (it refreshes `last_seen_at` each launch), so a
 * phone that is no longer used does not keep a token forever. Cheap, so it runs at most once an hour from the worker.
 */
export async function purgeStalePushDevices(admin) {
  if (Date.now() - lastPurge < 3_600_000) return;
  lastPurge = Date.now();
  const cutoff = new Date(Date.now() - STALE_DEVICE_DAYS * 86_400_000).toISOString();
  const { error } = await admin.from("push_devices").delete().lt("last_seen_at", cutoff);
  if (error) console.error("[push] could not purge stale devices:", error.code);
}

/** Worker step: push each member's newly created unread notifications (one summary push if there are many). */
export async function processPushNotifications({ limit = 100 } = {}) {
  if (!pushAvailable()) return { skipped: "push not configured" };
  const admin = createAdminClient();
  if (getIntegrations().fcm) await purgeStalePushDevices(admin);
  const { data: rows, error } = await admin.rpc("claim_push_notifications", { p_limit: limit });
  if (error) return { error: error.message };
  const byUser = new Map();
  for (const n of rows ?? []) byUser.set(n.user_id, [...(byUser.get(n.user_id) ?? []), n]);
  let pushed = 0;
  for (const [userId, items] of byUser) {
    // A summary keeps the category when every notification in it shares one, so a muted channel stays muted.
    const categories = new Set(items.map((i) => i.category));
    const payloads = items.length > 3
      ? [{ title: "UniSphere", body: `You have ${items.length} new notifications`, url: "/notifications", tag: "digest", category: categories.size === 1 ? [...categories][0] : "updates" }]
      : items.map(toPayload);
    for (const p of payloads) pushed += (await sendToUser(admin, userId, p)).delivered;
  }
  return { claimed: rows?.length ?? 0, pushed };
}

/** For Admin > Settings: which kinds of push this server can send, and how many devices of each are registered. Counts only, never tokens. */
export async function getPushOverview() {
  const on = getIntegrations();
  const admin = createAdminClient();
  const count = async (table) => (await admin.from(table).select("id", { count: "exact", head: true })).count ?? 0;
  const [webDevices, androidDevices] = await Promise.all([count("push_subscriptions"), count("push_devices")]);
  return { web: { configured: on.push, devices: webDevices }, android: { configured: on.fcm, devices: androidDevices } };
}
