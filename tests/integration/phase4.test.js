import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GREENFIELD, RIVERSIDE, admin, anon, cleanupUsers, createUser, grantRoleDirect } from "../helpers/supabase.js";

/** Notifications, messaging, communities, events, announcements and opportunities, with real sessions. */

let a, b, c, d, outsider, collegeAdmin;
const tag = Math.random().toString(36).slice(2, 7);
const slug = (p) => `${p}-${tag}-${Math.random().toString(36).slice(2, 7)}`;
const notes = async (user, { unread = false, ...filter } = {}) => {
  let q = admin.from("notifications").select("*").eq("user_id", user.id).match(filter);
  if (unread) q = q.is("read_at", null); // note: .match({ read_at: null }) would compare with the string "null"
  return (await q).data ?? [];
};

beforeAll(async () => {
  a = await createUser("p4-a");
  b = await createUser("p4-b");
  c = await createUser("p4-c");
  d = await createUser("p4-d");
  outsider = await createUser("p4-out", { collegeId: RIVERSIDE });
  collegeAdmin = await createUser("p4-cadmin");
  await grantRoleDirect(collegeAdmin.id, "college_admin", GREENFIELD);
});
afterAll(async () => {
  await admin.from("communities").delete().like("slug", `%-${tag}-%`);
  await admin.from("events").delete().like("slug", `%-${tag}-%`);
  await admin.from("opportunities").delete().like("slug", `%-${tag}-%`);
  await cleanupUsers();
});

describe("notifications", () => {
  it("notifies authors of reactions, comments and replies; never notifies about your own actions", async () => {
    const { data: post } = await a.client.from("posts").insert({ author_id: a.id, slug: slug("n"), body: "Notify me", visibility: "public" }).select("id").single();
    await a.client.from("post_reactions").insert({ post_id: post.id, user_id: a.id }); // own reaction: no notification
    await b.client.from("post_reactions").insert({ post_id: post.id, user_id: b.id });
    const { data: c1 } = await b.client.from("comments").insert({ post_id: post.id, author_id: b.id, body: "Nice post" }).select("id").single();
    await c.client.from("comments").insert({ post_id: post.id, author_id: c.id, parent_id: c1.id, body: "Agreed" });

    const forA = await notes(a);
    // comments on one post collapse into a single unread notification, so a busy thread does not spam the author
    expect(forA.map((n) => n.type).sort()).toEqual(["comment", "reaction"]);
    expect(forA.every((n) => n.actor_id !== a.id)).toBe(true);
    const forB = await notes(b);
    expect(forB.map((n) => n.type)).toEqual(["reply"]);
    // snippets, not full private content, are stored
    expect(forA.find((n) => n.type === "comment").data.snippet.length).toBeLessThanOrEqual(140);
  });

  it("only shows notifications to their owner and lets owners mark them read", async () => {
    const mine = await notes(a);
    expect((await b.client.from("notifications").select("id").eq("id", mine[0].id)).data).toHaveLength(0);
    expect((await a.client.from("notifications").select("id").eq("id", mine[0].id)).data).toHaveLength(1);
    expect((await b.client.rpc("mark_notification_read", { p_id: mine[0].id })).error).toBeNull(); // no effect on others' rows
    expect((await admin.from("notifications").select("read_at").eq("id", mine[0].id).single()).data.read_at).toBeNull();
    await a.client.rpc("mark_notification_read", { p_id: mine[0].id });
    expect((await admin.from("notifications").select("read_at").eq("id", mine[0].id).single()).data.read_at).not.toBeNull();
    const unreadBefore = (await a.client.rpc("unread_notification_count")).data;
    expect(unreadBefore).toBeGreaterThan(0);
    await a.client.rpc("mark_all_notifications_read");
    expect((await a.client.rpc("unread_notification_count")).data).toBe(0);
    // users cannot forge notifications for anyone
    expect((await a.client.from("notifications").insert({ user_id: b.id, type: "reaction", category: "social" })).error).not.toBeNull();
    expect((await a.client.rpc("notify", { p_user: b.id, p_type: "reaction" })).error).not.toBeNull();
  });

  it("deduplicates repeat reactions while unread and respects blocks and preferences", async () => {
    const { data: post } = await d.client.from("posts").insert({ author_id: d.id, slug: slug("n"), body: "Dedupe", visibility: "public" }).select("id").single();
    await a.client.from("post_reactions").insert({ post_id: post.id, user_id: a.id });
    await a.client.from("post_reactions").update({ reaction: "celebrate" }).eq("post_id", post.id).eq("user_id", a.id);
    expect((await notes(d, { type: "reaction" }))).toHaveLength(1);

    // blocked actors do not notify
    await d.client.rpc("block_user", { p_target: c.id });
    await c.client.from("post_reactions").insert({ post_id: post.id, user_id: c.id });
    expect((await notes(d, { type: "reaction" }))).toHaveLength(1);
    await d.client.rpc("unblock_user", { p_target: c.id });

    // turning a category off stops in-app delivery
    await d.client.from("notification_preferences").insert({ user_id: d.id, category: "social", in_app: false, email: false });
    await c.client.from("post_reactions").delete().eq("post_id", post.id).eq("user_id", c.id);
    await c.client.from("post_reactions").insert({ post_id: post.id, user_id: c.id });
    expect((await notes(d, { type: "reaction" }))).toHaveLength(1);
    // preferences are private and only the in_app/email columns are editable
    expect((await a.client.from("notification_preferences").select("*").eq("user_id", d.id)).data).toHaveLength(0);
    expect((await d.client.from("notification_preferences").update({ user_id: a.id }).eq("user_id", d.id)).error).not.toBeNull();
  });

  it("queues email only where the member asked for it, with a default that avoids chatty categories", async () => {
    const e = await createUser("p4-email");
    const { data: pr } = await a.client.from("projects").insert({ owner_id: a.id, slug: slug("pj"), name: "Mail project", visibility: "public", looking_for_members: true }).select("id").single();
    const req = await e.client.rpc("request_to_join_project", { p_project: pr.id });
    expect(req.error).toBeNull();
    const toOwner = await notes(a, { type: "project_join_request" });
    expect(toOwner[0].email_status).toBe("pending"); // projects: email on by default

    const social = (await notes(a, { type: "comment" })).concat(await notes(a, { type: "reaction" }));
    expect(social.every((n) => n.email_status === "none")).toBe(true); // social: email off by default
    await admin.from("projects").delete().eq("id", pr.id);
  });
});

describe("messaging", () => {
  it("enforces who may message whom, on the server", async () => {
    await admin.from("profiles").update({ allow_messages_from: "connections" }).eq("id", b.id);
    // default allow_messages_from = connections
    expect((await a.client.rpc("start_direct_conversation", { p_other: b.id })).error?.message).toContain("cannot_message");
    await b.client.rpc("send_connection_request", { p_recipient: a.id });
    const { data: reqRow } = await a.client.from("connection_requests").select("id").eq("requester_id", b.id).eq("status", "pending").single();
    await a.client.rpc("respond_connection_request", { p_id: reqRow.id, p_accept: true });
    const conv = await a.client.rpc("start_direct_conversation", { p_other: b.id });
    expect(conv.error).toBeNull();
    // the same pair always resolves to the same conversation
    expect((await b.client.rpc("start_direct_conversation", { p_other: a.id })).data).toBe(conv.data);
    // yourself, blocked users, restricted senders and settings 'nobody'
    expect((await a.client.rpc("start_direct_conversation", { p_other: a.id })).error).not.toBeNull();
    await admin.from("profiles").update({ allow_messages_from: "everyone" }).eq("id", c.id);
    expect((await a.client.rpc("start_direct_conversation", { p_other: c.id })).error).toBeNull();
    await admin.from("profiles").update({ allow_messages_from: "nobody" }).eq("id", c.id);
    expect((await d.client.rpc("start_direct_conversation", { p_other: c.id })).error?.message).toContain("cannot_message");
    await admin.from("profiles").update({ allow_messages_from: "college" }).eq("id", d.id);
    expect((await a.client.rpc("start_direct_conversation", { p_other: d.id })).error).toBeNull(); // same college
    expect((await outsider.client.rpc("start_direct_conversation", { p_other: d.id })).error?.message).toContain("cannot_message"); // other college
  });

  it("only members can read or send; senders cannot be forged; blocking stops contact immediately", async () => {
    // blocking removes the connection, so keep the pair reachable afterwards to test the remaining rules
    await admin.from("profiles").update({ allow_messages_from: "everyone" }).in("id", [a.id, b.id]);
    const { data: convId } = await a.client.rpc("start_direct_conversation", { p_other: b.id });
    const sent = await a.client.from("messages").insert({ conversation_id: convId, sender_id: a.id, body: "Hello B" }).select("id").single();
    expect(sent.error).toBeNull();
    expect((await b.client.from("messages").select("body").eq("id", sent.data.id)).data).toHaveLength(1);
    expect((await c.client.from("messages").select("id").eq("conversation_id", convId)).data).toHaveLength(0);
    expect((await c.client.from("conversations").select("id").eq("id", convId)).data).toHaveLength(0);
    expect((await c.client.from("messages").insert({ conversation_id: convId, sender_id: c.id, body: "intruder" })).error).not.toBeNull();
    expect((await b.client.from("messages").insert({ conversation_id: convId, sender_id: a.id, body: "forged" })).error).not.toBeNull();
    expect((await a.client.from("messages").insert({ conversation_id: convId, sender_id: a.id, body: "x".repeat(4001) })).error).not.toBeNull();

    await b.client.rpc("block_user", { p_target: a.id });
    expect((await a.client.from("messages").insert({ conversation_id: convId, sender_id: a.id, body: "still there?" })).error).not.toBeNull();
    expect((await b.client.from("messages").insert({ conversation_id: convId, sender_id: b.id, body: "me too" })).error).not.toBeNull();
    expect((await a.client.rpc("can_send_in_conversation", { p_conv: convId })).data).toBe(false);
    await b.client.rpc("unblock_user", { p_target: a.id });
    expect((await a.client.rpc("can_send_in_conversation", { p_conv: convId })).data).toBe(true); // allowed again once unblocked
  });

  it("tracks unread counts and read receipts, notifies once per conversation, and supports deleting own messages", async () => {
    const { data: convId } = await a.client.rpc("start_direct_conversation", { p_other: b.id });
    await a.client.from("messages").insert([{ conversation_id: convId, sender_id: a.id, body: "one" }, { conversation_id: convId, sender_id: a.id, body: "two" }].slice(0, 1));
    await a.client.from("messages").insert({ conversation_id: convId, sender_id: a.id, body: "two" });
    const unread = (await b.client.rpc("unread_message_counts")).data.find((r) => r.conversation_id === convId);
    expect(Number(unread.unread)).toBeGreaterThanOrEqual(2);
    const msgNotes = await notes(b, { type: "message", entity_id: convId, unread: true });
    expect(msgNotes).toHaveLength(1); // collapsed: one unread notification per conversation

    await b.client.rpc("mark_conversation_read", { p_conv: convId });
    expect((await b.client.rpc("unread_message_counts")).data.find((r) => r.conversation_id === convId)).toBeUndefined();
    expect((await notes(b, { type: "message", entity_id: convId, unread: true }))).toHaveLength(0);
    const { data: members } = await a.client.from("conversation_members").select("user_id, last_read_at").eq("conversation_id", convId);
    expect(members).toHaveLength(2); // the sender can see the other's read position (read receipt)

    const { data: last } = await a.client.from("messages").select("id").eq("conversation_id", convId).order("created_at", { ascending: false }).limit(1).single();
    expect((await b.client.from("messages").update({ status: "deleted" }).eq("id", last.id).select()).data ?? []).toHaveLength(0); // not the sender
    expect((await a.client.from("messages").update({ status: "deleted" }).eq("id", last.id)).error).toBeNull();
    expect((await b.client.from("messages").select("body, status").eq("id", last.id).single()).data).toEqual({ body: "", status: "deleted" });
  });

  it("keeps message attachments inside the conversation", async () => {
    const { data: convId } = await a.client.rpc("start_direct_conversation", { p_other: b.id });
    const { data: file } = await admin.from("files").insert({ owner_id: a.id, bucket: "private", storage_key: `message_attachment/${a.id}/${crypto.randomUUID()}.png`, purpose: "message_attachment", mime_type: "image/png", size_bytes: 10, status: "ready" }).select("id").single();
    const { data: msg } = await a.client.from("messages").insert({ conversation_id: convId, sender_id: a.id, body: "" }).select("id").single();
    expect((await a.client.from("message_attachments").insert({ message_id: msg.id, file_id: file.id })).error).toBeNull();
    expect((await b.client.from("files").select("id").eq("id", file.id)).data).toHaveLength(1);
    expect((await c.client.from("files").select("id").eq("id", file.id)).data).toHaveLength(0);
    expect((await anon().from("files").select("id").eq("id", file.id)).data).toHaveLength(0);
  });

  it("lets a participant report a message (snapshotted) but not one they cannot see", async () => {
    const { data: convId } = await a.client.rpc("start_direct_conversation", { p_other: b.id });
    const { data: msg } = await a.client.from("messages").insert({ conversation_id: convId, sender_id: a.id, body: "reportable words" }).select("id").single();
    expect((await b.client.rpc("submit_report", { p_target_type: "message", p_target_id: msg.id, p_category: "harassment" })).error).toBeNull();
    expect((await admin.from("reports").select("snapshot, target_owner_id").eq("target_id", msg.id).single()).data).toMatchObject({ target_owner_id: a.id, snapshot: { body: "reportable words" } });
    expect((await c.client.rpc("submit_report", { p_target_type: "message", p_target_id: msg.id, p_category: "spam" })).error?.message).toContain("target_unavailable");
    expect((await a.client.rpc("submit_report", { p_target_type: "message", p_target_id: msg.id, p_category: "spam" })).error).not.toBeNull(); // own message
  });
});

describe("communities", () => {
  let community;
  it("creates, owns, and gates posting to active members", async () => {
    const { data, error } = await a.client.from("communities").insert({ created_by: a.id, slug: slug("cm"), name: `Robotics ${tag}`, visibility: "college", join_policy: "request" }).select("id, slug").single();
    expect(error).toBeNull();
    community = data;
    expect((await admin.from("community_members").select("role, status").eq("community_id", community.id).eq("user_id", a.id).single()).data).toEqual({ role: "owner", status: "active" });
    expect((await admin.from("communities").select("is_official").eq("id", community.id).single()).data.is_official).toBe(false);
    // non-members cannot post into it
    expect((await b.client.from("posts").insert({ author_id: b.id, slug: slug("cp"), body: "sneak", visibility: "community", community_id: community.id })).error).not.toBeNull();
  });

  it("supports request-to-join approval, roles, bans and invite-only rules", async () => {
    expect((await b.client.rpc("join_community", { p_community: community.id })).data).toBe("pending");
    expect((await b.client.from("posts").insert({ author_id: b.id, slug: slug("cp"), body: "pending can't post", visibility: "community", community_id: community.id })).error).not.toBeNull();
    expect((await c.client.rpc("respond_community_membership", { p_community: community.id, p_user: b.id, p_accept: true })).error?.message).toContain("forbidden");
    expect((await a.client.rpc("respond_community_membership", { p_community: community.id, p_user: b.id, p_accept: true })).error).toBeNull();
    expect((await admin.from("communities").select("member_count").eq("id", community.id).single()).data.member_count).toBe(2);

    const post = await b.client.from("posts").insert({ author_id: b.id, slug: slug("cp"), body: "members only note", visibility: "college", community_id: community.id }).select("id, visibility").single();
    expect(post.error).toBeNull();
    expect(post.data.visibility).toBe("community"); // forced to members-only
    const seen = async (u) => (await u.client.from("post_feed").select("id").eq("id", post.data.id)).data.length;
    expect(await seen(b)).toBe(1);
    expect(await seen(d)).toBe(0); // same college but not a member
    expect(await seen({ client: anon() })).toBe(0);

    expect((await b.client.rpc("manage_community_member", { p_community: community.id, p_user: a.id, p_action: "ban" })).error).not.toBeNull(); // cannot touch the owner
    expect((await b.client.rpc("set_community_official", { p_community: community.id, p_official: true })).error?.message).toContain("forbidden");
    expect((await collegeAdmin.client.rpc("set_community_official", { p_community: community.id, p_official: true })).error).toBeNull();
    expect((await admin.from("communities").select("is_official").eq("id", community.id).single()).data.is_official).toBe(true);

    expect((await a.client.rpc("manage_community_member", { p_community: community.id, p_user: b.id, p_action: "ban" })).error).toBeNull();
    expect((await b.client.rpc("join_community", { p_community: community.id })).error?.message).toContain("banned");
    expect((await b.client.from("posts").insert({ author_id: b.id, slug: slug("cp"), body: "banned", visibility: "community", community_id: community.id })).error).not.toBeNull();
    expect((await a.client.rpc("leave_community", { p_community: community.id })).error?.message).toContain("owner_cannot_leave");
    expect((await outsider.client.from("community_cards").select("id").eq("id", community.id)).data).toHaveLength(0); // other college
  });

  it("owner can edit, other members cannot", async () => {
    expect((await a.client.from("communities").update({ description: "We build robots" }).eq("id", community.id).select()).data).toHaveLength(1);
    expect((await d.client.from("communities").update({ description: "hacked" }).eq("id", community.id).select()).data ?? []).toHaveLength(0);
    expect((await d.client.rpc("delete_community", { p_community: community.id })).error).not.toBeNull();
    expect((await a.client.rpc("delete_community", { p_community: community.id })).error).toBeNull();
    expect((await a.client.from("community_cards").select("id").eq("id", community.id)).data).toHaveLength(0);
  });
});

describe("events", () => {
  const future = (h) => new Date(Date.now() + h * 3600_000).toISOString();
  async function makeEvent(user, patch = {}) {
    const { data, error } = await user.client.from("events").insert({ organizer_id: user.id, slug: slug("ev"), title: `Event ${tag}`, starts_at: future(48), ends_at: future(50), visibility: "college", ...patch }).select("id, slug").single();
    if (error) throw error;
    return data;
  }

  it("validates times and timezones and enforces visibility", async () => {
    expect((await a.client.from("events").insert({ organizer_id: a.id, slug: slug("ev"), title: "Bad times", starts_at: future(5), ends_at: future(1) })).error).not.toBeNull();
    expect((await a.client.from("events").insert({ organizer_id: a.id, slug: slug("ev"), title: "Bad tz", starts_at: future(5), timezone: "Mars/Base" })).error).not.toBeNull();
    const pub = await makeEvent(a, { visibility: "public" });
    const college = await makeEvent(a);
    const seen = async (client, id) => (await client.from("event_cards").select("id").eq("id", id)).data.length;
    expect(await seen(anon(), pub.id)).toBe(1);
    expect(await seen(anon(), college.id)).toBe(0);
    expect(await seen(d.client, college.id)).toBe(1);
    expect(await seen(outsider.client, college.id)).toBe(0);
  });

  it("handles RSVP, capacity, waitlist promotion and cancellation", async () => {
    const ev = await makeEvent(a, { capacity: 1 });
    expect((await b.client.rpc("rsvp_event", { p_event: ev.id, p_status: "going" })).data).toBe("going");
    expect((await d.client.rpc("rsvp_event", { p_event: ev.id, p_status: "going" })).data).toBe("waitlist");
    expect((await d.client.rpc("rsvp_event", { p_event: ev.id, p_status: "going" })).data).toBe("waitlist"); // idempotent
    expect((await admin.from("events").select("going_count").eq("id", ev.id).single()).data.going_count).toBe(1);
    // freeing the seat promotes the waitlisted member automatically
    await b.client.rpc("rsvp_event", { p_event: ev.id, p_status: "cancelled" });
    expect((await admin.from("event_registrations").select("status").eq("event_id", ev.id).eq("user_id", d.id).single()).data.status).toBe("going");
    expect((await admin.from("events").select("going_count").eq("id", ev.id).single()).data.going_count).toBe(1);
    // outsiders cannot RSVP to college-only events
    expect((await outsider.client.rpc("rsvp_event", { p_event: ev.id, p_status: "going" })).error?.message).toContain("event_unavailable");
    // attendance: organiser only
    expect((await d.client.rpc("mark_event_attendance", { p_event: ev.id, p_user: d.id, p_attended: true })).error?.message).toContain("forbidden");
    expect((await a.client.rpc("mark_event_attendance", { p_event: ev.id, p_user: d.id, p_attended: true })).error).toBeNull();
    // registrations are private to the member and organisers
    expect((await b.client.from("event_registrations").select("user_id").eq("event_id", ev.id)).data.every((r) => r.user_id === b.id)).toBe(true); // only their own row
    expect((await a.client.from("event_registrations").select("user_id").eq("event_id", ev.id)).data.length).toBeGreaterThan(0);

    expect((await d.client.rpc("cancel_event", { p_event: ev.id })).error?.message).toContain("forbidden");
    expect((await a.client.rpc("cancel_event", { p_event: ev.id, p_reason: "Speaker unwell" })).error).toBeNull();
    expect((await notes(d, { type: "event_update" }))[0].data.change).toContain("cancelled");
    expect((await b.client.rpc("rsvp_event", { p_event: ev.id, p_status: "going" })).error?.message).toContain("event_cancelled");
  });

  it("refuses RSVPs to past or externally-registered events and edits by non-organisers", async () => {
    const past = await makeEvent(a, { starts_at: future(-5), ends_at: future(-4) });
    expect((await b.client.rpc("rsvp_event", { p_event: past.id, p_status: "going" })).error?.message).toContain("event_over");
    const ext = await makeEvent(a, { registration_mode: "external", registration_url: "https://example.org/register" });
    expect((await b.client.rpc("rsvp_event", { p_event: ext.id, p_status: "going" })).error?.message).toContain("registration_external");
    expect((await b.client.from("events").update({ title: "hijacked" }).eq("id", ext.id).select()).data ?? []).toHaveLength(0);
    expect((await collegeAdmin.client.from("events").update({ title: "Moderated title" }).eq("id", ext.id).select()).data).toHaveLength(1); // college admin
  });

  it("sends each reminder once and only to people who are going", async () => {
    const ev = await makeEvent(a, { starts_at: future(0.5), ends_at: future(2) });
    await b.client.rpc("rsvp_event", { p_event: ev.id, p_status: "going" });
    await d.client.rpc("rsvp_event", { p_event: ev.id, p_status: "interested" });
    const first = await admin.rpc("claim_event_reminders", { p_kind: "1h" });
    const mine = first.data.filter((r) => r.event_id === ev.id);
    expect(mine.map((r) => r.user_id)).toEqual([b.id]);
    const again = await admin.rpc("claim_event_reminders", { p_kind: "1h" });
    expect(again.data.filter((r) => r.event_id === ev.id)).toHaveLength(0);
    const day = await admin.rpc("claim_event_reminders", { p_kind: "24h" });
    expect(day.data.filter((r) => r.event_id === ev.id)).toHaveLength(0); // the 1h reminder superseded it
  });
});

describe("announcements and opportunities", () => {
  it("only authorised staff publish announcements, and they reach only their college", async () => {
    expect((await a.client.rpc("publish_announcement", { p_college: GREENFIELD, p_title: "Fake notice", p_body: "x" })).error?.message).toContain("forbidden");
    expect((await collegeAdmin.client.rpc("publish_announcement", { p_college: RIVERSIDE, p_title: "Wrong college", p_body: "x" })).error?.message).toContain("forbidden");
    const ok = await collegeAdmin.client.rpc("publish_announcement", { p_college: GREENFIELD, p_title: `Exams ${tag}`, p_body: "Timetable is out", p_pinned: true });
    expect(ok.error).toBeNull();
    expect((await b.client.from("college_announcements").select("id").eq("id", ok.data)).data).toHaveLength(1);
    expect((await outsider.client.from("college_announcements").select("id").eq("id", ok.data)).data).toHaveLength(0);
    expect((await anon().from("college_announcements").select("id")).error).not.toBeNull();
    expect((await notes(b, { type: "announcement" })).some((n) => n.data.title === `Exams ${tag}`)).toBe(true);
    expect((await admin.from("audit_logs").select("action").eq("target_id", ok.data)).data).toEqual([{ action: "announcement.published" }]);
    expect((await a.client.rpc("archive_announcement", { p_id: ok.data })).error?.message).toContain("forbidden");
    expect((await collegeAdmin.client.rpc("archive_announcement", { p_id: ok.data })).error).toBeNull();
    expect((await b.client.from("college_announcements").select("id").eq("id", ok.data)).data).toHaveLength(0);
  });

  it("opportunities follow visibility, ownership and moderation rights", async () => {
    const mk = (u, patch = {}) => u.client.from("opportunities").insert({ poster_id: u.id, slug: slug("op"), title: `Intern ${tag}`, organization: "Acme", visibility: "college", ...patch }).select("id").single();
    const pub = (await mk(a, { visibility: "public" })).data;
    const col = (await mk(a)).data;
    expect((await anon().from("opportunities").select("id").eq("id", pub.id)).data).toHaveLength(1);
    expect((await anon().from("opportunities").select("id").eq("id", col.id)).data).toHaveLength(0);
    expect((await d.client.from("opportunities").select("id").eq("id", col.id)).data).toHaveLength(1);
    expect((await outsider.client.from("opportunities").select("id").eq("id", col.id)).data).toHaveLength(0);
    expect((await b.client.from("opportunities").insert({ poster_id: a.id, slug: slug("op"), title: "Forged post", organization: "X" })).error).not.toBeNull();
    expect((await b.client.from("opportunities").update({ status: "closed" }).eq("id", col.id).select()).data ?? []).toHaveLength(0);
    expect((await a.client.from("opportunities").update({ status: "closed" }).eq("id", col.id).select()).data).toHaveLength(1);
    expect((await collegeAdmin.client.from("opportunities").update({ deleted_at: new Date().toISOString() }).eq("id", col.id).select()).data).toHaveLength(1);
    expect((await d.client.from("opportunities").select("id").eq("id", col.id)).data).toHaveLength(0);
  });
});

describe("worker plumbing", () => {
  it("claims notification emails exactly once and never exposes the claim functions to members", async () => {
    expect((await a.client.rpc("claim_notification_emails", { p_limit: 5 })).error).not.toBeNull();
    expect((await a.client.rpc("claim_ai_jobs", { p_limit: 5 })).error).not.toBeNull();
    expect((await a.client.rpc("orphan_files", { p_limit: 5 })).error).not.toBeNull();
    const target = await createUser("p4-claim");
    await admin.from("notifications").insert({ user_id: target.id, type: "project_invitation", category: "projects", email_status: "pending", created_at: new Date(Date.now() - 5 * 60_000).toISOString() });
    const first = await admin.rpc("claim_notification_emails", { p_limit: 500, p_min_age_sec: 60 });
    expect(first.data.filter((n) => n.user_id === target.id)[0].email_attempts).toBe(1);
  });
});
