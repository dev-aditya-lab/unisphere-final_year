import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GREENFIELD, RIVERSIDE, admin, anon, cleanupUsers, createUser, grantRoleDirect } from "../helpers/supabase.js";

/**
 * Notification controls (migration 0063): the Push switch per category, official broadcasts and who they may reach,
 * who an instant message push goes to, and the 15 seconds the worker leaves a message for that instant push.
 */
const tag = Math.random().toString(36).slice(2, 8);
const token = (n) => `fcm-nc-${tag}-${n}:APA91b${"y".repeat(60)}`;
const notify = (user, type, over = {}) =>
  admin.rpc("notify", { p_user: user.id, p_type: type, p_actor: over.actor ?? null, p_entity_type: null, p_entity_id: over.entity ?? null, p_data: over.data ?? {}, p_dedupe: over.dedupe ?? null });
const latest = async (user, type) =>
  (await admin.from("notifications").select("*").eq("user_id", user.id).eq("type", type).order("created_at", { ascending: false }).limit(1)).data[0];
const pref = (user, category, values) => admin.from("notification_preferences").upsert({ user_id: user.id, category, ...values }, { onConflict: "user_id,category" });
const device = (user, n) => admin.from("push_devices").insert({ user_id: user.id, platform: "android", token: token(n) });

let staff, collegeStaff, alice, bob, carol, outsider;

beforeAll(async () => {
  staff = await createUser("nc-staff");
  await grantRoleDirect(staff.id, "global_admin");
  collegeStaff = await createUser("nc-college");
  await grantRoleDirect(collegeStaff.id, "college_admin", GREENFIELD);
  alice = await createUser("nc-alice");
  bob = await createUser("nc-bob");
  carol = await createUser("nc-carol", { collegeId: RIVERSIDE, accountType: "alumni" });
  outsider = await createUser("nc-outsider");
});
afterAll(async () => {
  await admin.from("push_devices").delete().like("token", `fcm-nc-${tag}-%`);
  await admin.from("admin_broadcasts").delete().like("title", `NC ${tag}%`);
  await cleanupUsers();
});

describe("the Push switch", () => {
  it("is on by default and can be changed by its owner only", async () => {
    await pref(alice, "social", {});
    const { data } = await admin.from("notification_preferences").select("push, in_app").eq("user_id", alice.id).eq("category", "social").single();
    expect(data).toEqual({ push: true, in_app: true });

    const own = await alice.client.from("notification_preferences").update({ push: false }).eq("user_id", alice.id).eq("category", "social");
    expect(own.error).toBeNull();
    expect((await admin.from("notification_preferences").select("push").eq("user_id", alice.id).eq("category", "social").single()).data.push).toBe(false);

    await bob.client.from("notification_preferences").update({ push: false }).eq("user_id", alice.id); // RLS: matches nothing
    await admin.from("notification_preferences").update({ push: true }).eq("user_id", alice.id);
    await bob.client.from("notification_preferences").update({ push: false }).eq("user_id", alice.id);
    expect((await admin.from("notification_preferences").select("push").eq("user_id", alice.id).eq("category", "social").single()).data.push).toBe(true);
  });

  it("creates the notification already pushed when Push is off, so the worker never sends it", async () => {
    await pref(alice, "social", { push: false });
    await notify(alice, "reaction", { actor: bob.id, dedupe: `r1-${tag}` });
    const row = await latest(alice, "reaction");
    expect(row).toBeTruthy();
    expect(row.pushed_at).not.toBeNull();
    expect(row.read_at).toBeNull(); // still in the bell

    await pref(alice, "social", { push: true });
    await notify(alice, "reaction", { actor: bob.id, dedupe: `r2-${tag}` });
    expect((await latest(alice, "reaction")).pushed_at).toBeNull();
  });

  it("switches one feature off without touching another", async () => {
    await pref(alice, "social", { push: false });
    await pref(alice, "events", { push: true });
    await notify(alice, "event_reminder", { actor: bob.id, dedupe: `ev-${tag}` });
    expect((await latest(alice, "event_reminder")).pushed_at).toBeNull();
  });

  it("needs the bell: In app off means no phone notification either", async () => {
    await pref(bob, "connections", { in_app: false, push: true, email: true });
    await notify(bob, "connection_request", { actor: alice.id, dedupe: `cr-${tag}` });
    const row = await latest(bob, "connection_request");
    expect(row.read_at).not.toBeNull(); // email only: nothing for the bell
    expect(row.pushed_at).not.toBeNull(); // and nothing for the phone
    expect(row.email_status).toBe("pending");
  });

  it("creates nothing at all when every switch is off", async () => {
    await pref(carol, "mentorship", { in_app: false, push: false, email: false });
    await notify(carol, "mentorship_request", { actor: alice.id, dedupe: `m-${tag}` });
    expect(await latest(carol, "mentorship_request")).toBeUndefined();
  });

  it("never pushes Offers & invitations, whatever the switch says", async () => {
    await pref(alice, "promotions", { push: true, in_app: true });
    await notify(alice, "referral_campaign", { dedupe: `promo-${tag}` });
    const row = await latest(alice, "referral_campaign");
    expect(row).toBeTruthy();
    expect(row.pushed_at).not.toBeNull();
  });

  it("still honours blocks", async () => {
    await alice.client.rpc("block_user", { p_target: carol.id });
    await notify(alice, "follow", { actor: carol.id, dedupe: `blk-${tag}` });
    expect(await latest(alice, "follow")).toBeUndefined();
    await alice.client.rpc("unblock_user", { p_target: carol.id });
  });
});

describe("what the worker leaves for the instant push", () => {
  const claimFor = async (user) => (await admin.rpc("claim_push_notifications", { p_limit: 500 })).data.filter((r) => r.user_id === user.id);

  it("waits 15 seconds before it picks up a message, but not any other notification", async () => {
    const dev = await createUser("nc-worker");
    await device(dev, 1);
    await admin.from("notifications").insert([
      { user_id: dev.id, type: "message", category: "messages", data: {}, dedupe_key: "fresh-msg" },
      { user_id: dev.id, type: "reaction", category: "social", data: {}, dedupe_key: "fresh-reaction" },
    ]);
    const first = await claimFor(dev);
    expect(first.map((r) => r.type)).toEqual(["reaction"]);

    await admin.from("notifications").update({ created_at: new Date(Date.now() - 30_000).toISOString() }).eq("user_id", dev.id).eq("type", "message");
    expect((await claimFor(dev)).map((r) => r.type)).toEqual(["message"]);
    expect(await claimFor(dev)).toEqual([]);
  });
});

describe("who an instant message push goes to", () => {
  let conv, dm;
  const targets = async (sender = alice) => (await admin.rpc("message_push_targets", { p_conversation: conv, p_sender: sender.id })).data ?? [];
  const ids = async (sender) => (await targets(sender)).map((t) => t.user_id).sort();

  beforeAll(async () => {
    await admin.from("profiles").update({ allow_messages_from: "everyone" }).in("id", [alice.id, bob.id, carol.id]);
    conv = (await alice.client.rpc("start_direct_conversation", { p_other: bob.id })).data;
    dm = conv;
    await device(bob, 10);
  });

  it("is the other member when they have a phone, with the sender's name", async () => {
    const res = await targets();
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({ user_id: bob.id, sender_name: "Test nc-alice" });
  });

  it("is never the sender", async () => {
    expect(await ids(bob)).toEqual([]); // alice has no phone registered; bob is the sender
  });

  it("counts unread messages for the recipient", async () => {
    for (const body of ["one", "two", "three"]) {
      const sent = await alice.client.rpc("send_message", { p_conversation: conv, p_body: body, p_file_ids: [], p_client_op_id: crypto.randomUUID() });
      expect(sent.error).toBeNull();
    }
    expect((await targets())[0].unread).toBe(3);
    expect((await bob.client.rpc("mark_conversation_read", { p_conv: conv })).error).toBeNull();
    expect((await targets())[0].unread).toBe(0);
  });

  it("skips a member who muted the conversation", async () => {
    await admin.from("conversation_members").update({ muted: true }).eq("conversation_id", dm).eq("user_id", bob.id);
    expect(await ids()).toEqual([]);
    await admin.from("conversation_members").update({ muted: false }).eq("conversation_id", dm).eq("user_id", bob.id);
    expect(await ids()).toEqual([bob.id]);
  });

  it("skips a member who turned the Messages push or bell switch off", async () => {
    await pref(bob, "messages", { push: false });
    expect(await ids()).toEqual([]);
    await pref(bob, "messages", { push: true, in_app: false });
    expect(await ids()).toEqual([]);
    await pref(bob, "messages", { push: true, in_app: true });
    expect(await ids()).toEqual([bob.id]);
  });

  it("skips a blocked pair, both ways", async () => {
    await bob.client.rpc("block_user", { p_target: alice.id });
    expect(await ids()).toEqual([]);
    await bob.client.rpc("unblock_user", { p_target: alice.id });
    await alice.client.rpc("block_user", { p_target: bob.id });
    expect(await ids()).toEqual([]);
    await alice.client.rpc("unblock_user", { p_target: bob.id });
    expect(await ids()).toEqual([bob.id]);
  });

  it("skips a member with no phone and no browser subscription, and counts a browser as a device", async () => {
    await admin.from("push_devices").delete().eq("user_id", bob.id);
    expect(await ids()).toEqual([]);
    await admin.from("push_subscriptions").insert({ user_id: bob.id, endpoint: `https://push.invalid/nc-${tag}`, p256dh: "k", auth: "a" });
    expect(await ids()).toEqual([bob.id]);
  });

  it("skips a suspended account", async () => {
    await admin.from("profiles").update({ status: "suspended" }).eq("id", bob.id);
    expect(await ids()).toEqual([]);
    await admin.from("profiles").update({ status: "active" }).eq("id", bob.id);
  });

  it("can be called only by the server", async () => {
    expect((await alice.client.rpc("message_push_targets", { p_conversation: conv, p_sender: alice.id })).error).not.toBeNull();
    expect((await anon().rpc("message_push_targets", { p_conversation: conv, p_sender: alice.id })).error).not.toBeNull();
  });
});

describe("broadcasts", () => {
  const send = (who, over = {}) =>
    who.client.rpc("send_broadcast", {
      p_title: `NC ${tag} hello`, p_body: "A short official note.", p_href: null, p_audience: { usernames: [alice.username] }, p_push: true, ...over,
    });
  const received = async (user, id) => (await admin.from("notifications").select("*").eq("user_id", user.id).eq("dedupe_key", `bc:${id}`)).data;

  it("refuses anyone who is not staff, for sending and for counting", async () => {
    const sent = await send(alice);
    expect(sent.error?.message ?? "").toMatch(/forbidden|permission/i);
    expect((await alice.client.rpc("broadcast_preview", { p_audience: { everyone: true } })).error).not.toBeNull();
    expect((await anon().rpc("send_broadcast", { p_title: "x", p_body: "y", p_href: null, p_audience: { everyone: true }, p_push: true })).error).not.toBeNull();
  });

  it("sends to named people only, as an 'announcement' with its page, and records it", async () => {
    const res = await send(staff, { p_audience: { usernames: [alice.username, bob.username.toUpperCase()] }, p_href: "/events" });
    expect(res.error).toBeNull();
    expect(res.data).toMatchObject({ targeted: 2, delivered: 2 });
    for (const user of [alice, bob]) {
      const [row] = await received(user, res.data.id);
      expect(row).toMatchObject({ type: "announcement", category: "announcements", actor_id: null, read_at: null, pushed_at: null });
      expect(row.data).toMatchObject({ title: `NC ${tag} hello`, href: "/events" });
    }
    expect(await received(carol, res.data.id)).toEqual([]);

    const log = await admin.from("audit_logs").select("action, actor_id").eq("target_id", res.data.id);
    expect(log.data?.[0]).toMatchObject({ action: "broadcast.sent", actor_id: staff.id });
  });

  it("falls back to the notifications page when no link is given", async () => {
    const res = await send(staff);
    const [row] = await received(alice, res.data.id);
    expect(row.data.href).toBe("/notifications");
  });

  it("previews how many people a send would reach", async () => {
    const { data, error } = await staff.client.rpc("broadcast_preview", { p_audience: { usernames: [alice.username, "nobody-here-" + tag] } });
    expect(error).toBeNull();
    expect(data).toMatchObject({ count: 1, sample: [alice.username], global: true });
  });

  it("reaches a college, a type of account, and the two together", async () => {
    const college = await send(staff, { p_audience: { colleges: [RIVERSIDE] } });
    expect(college.error).toBeNull();
    expect(await received(carol, college.data.id)).toHaveLength(1);
    expect(await received(alice, college.data.id)).toEqual([]);

    const alumni = await send(staff, { p_audience: { colleges: [GREENFIELD, RIVERSIDE], account_types: ["alumni"] } });
    expect(await received(carol, alumni.data.id)).toHaveLength(1);
    expect(await received(alice, alumni.data.id)).toEqual([]); // a student
  });

  it("reaches the active members of a community, not the pending or banned", async () => {
    const { data: c } = await admin.from("communities").insert({ created_by: alice.id, slug: `nc-${tag}`, name: "NC community", kind: "community", visibility: "public", join_policy: "open" }).select("id").single();
    await admin.from("community_members").insert([
      { community_id: c.id, user_id: alice.id, status: "active" },
      { community_id: c.id, user_id: bob.id, status: "pending" },
      { community_id: c.id, user_id: carol.id, status: "banned" },
    ]);
    const res = await send(staff, { p_audience: { communities: [c.id] } });
    expect(res.data.targeted).toBe(1);
    expect(await received(alice, res.data.id)).toHaveLength(1);
    expect(await received(bob, res.data.id)).toEqual([]);
    await admin.from("communities").delete().eq("id", c.id);
  });

  it("reaches everyone who is active and finished joining, and nobody else", async () => {
    const pending = await createUser("nc-notonboarded");
    await admin.from("profiles").update({ onboarded_at: null }).eq("id", pending.id);
    const gone = await createUser("nc-suspended");
    await admin.from("profiles").update({ status: "suspended" }).eq("id", gone.id);

    const res = await send(staff, { p_audience: { everyone: true } });
    expect(res.error).toBeNull();
    expect(await received(alice, res.data.id)).toHaveLength(1);
    expect(await received(pending, res.data.id)).toEqual([]);
    expect(await received(gone, res.data.id)).toEqual([]);
  });

  it("keeps college staff inside their own college, even when they ask for everyone", async () => {
    const res = await send(collegeStaff, { p_audience: { everyone: true } });
    expect(res.error).toBeNull();
    expect(await received(alice, res.data.id)).toHaveLength(1); // Greenfield
    expect(await received(carol, res.data.id)).toEqual([]); // Riverside

    const other = await send(collegeStaff, { p_audience: { colleges: [RIVERSIDE] } });
    expect(other.error?.message ?? "").toMatch(/no_recipients/);
    const preview = await collegeStaff.client.rpc("broadcast_preview", { p_audience: { usernames: [carol.username] } });
    expect(preview.data.count).toBe(0);
    expect(preview.data.global).toBe(false);
  });

  it("respects each member's own switches for the Announcements category", async () => {
    await pref(alice, "announcements", { in_app: true, push: false });
    await pref(bob, "announcements", { in_app: false, push: true, email: false });
    const res = await send(staff, { p_audience: { usernames: [alice.username, bob.username] } });
    expect(res.data).toMatchObject({ targeted: 2, delivered: 1 });
    expect((await received(alice, res.data.id))[0].pushed_at).not.toBeNull(); // bell yes, phone no
    expect(await received(bob, res.data.id)).toEqual([]); // nothing wanted
    await pref(alice, "announcements", { in_app: true, push: true });
    await pref(bob, "announcements", { in_app: true, push: true });
  });

  it("can leave the phone out when the sender asks for the bell only", async () => {
    const res = await send(staff, { p_push: false });
    expect((await received(alice, res.data.id))[0].pushed_at).not.toBeNull();
  });

  it("rejects an empty message, a link that leaves the site, and an audience nobody is in", async () => {
    expect((await send(staff, { p_title: "   " })).error?.message ?? "").toMatch(/invalid_message/);
    expect((await send(staff, { p_body: "" })).error?.message ?? "").toMatch(/invalid_message/);
    for (const href of ["https://evil.example", "//evil.example", "javascript:alert(1)", "events"]) {
      expect((await send(staff, { p_href: href })).error?.message ?? "", href).toMatch(/invalid_link/);
    }
    expect((await send(staff, { p_audience: { usernames: ["nobody-here-" + tag] } })).error?.message ?? "").toMatch(/no_recipients/);
    expect((await send(staff, { p_audience: {} })).error?.message ?? "").toMatch(/no_recipients/);
  });

  it("shows a sender their own broadcasts, staff all of them, and a member none", async () => {
    expect((await staff.client.from("admin_broadcasts").select("id")).data.length).toBeGreaterThan(0);
    const mine = await collegeStaff.client.from("admin_broadcasts").select("created_by");
    expect(mine.data.every((r) => r.created_by === collegeStaff.id)).toBe(true);
    expect((await alice.client.from("admin_broadcasts").select("id")).data).toEqual([]);
    expect((await alice.client.from("admin_broadcasts").insert({ title: "x", body: "y", audience: {} })).error).not.toBeNull();
  });

  it("does not send the same broadcast twice to someone who has not read it yet", async () => {
    const first = await send(staff, { p_audience: { usernames: [outsider.username] } });
    expect(first.data.delivered).toBe(1);
    const rows = await admin.from("notifications").select("id").eq("user_id", outsider.id).eq("dedupe_key", `bc:${first.data.id}`);
    expect(rows.data).toHaveLength(1);
  });
});

describe("the code and the database agree about categories", () => {
  it("puts every notification type the code can create in the same category, and every category has a switch that can be stored", async () => {
    const { emittedNotificationTypes } = await import("../helpers/notification-types.js");
    const { NOTIFICATION_CATEGORIES, notificationCategory } = await import("../../lib/notification-text.js");
    const categories = NOTIFICATION_CATEGORIES.map((c) => c.value);
    for (const type of emittedNotificationTypes().keys()) {
      const { data, error } = await admin.rpc("notification_category", { p_type: type });
      expect(error, type).toBeNull();
      expect(data, `database and lib/notification-text.js disagree about "${type}"`).toBe(notificationCategory(type));
      expect(categories).toContain(data);
    }
    for (const category of categories) {
      const res = await pref(outsider, category, { in_app: true, push: true, email: false });
      expect(res.error, `the database refuses a switch for "${category}"`).toBeNull();
    }
  });
});
