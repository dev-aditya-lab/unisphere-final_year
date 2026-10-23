import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, cleanupUsers, createUser, grantRoleDirect } from "../helpers/supabase.js";
import { PERMISSIONS } from "../../lib/community/rules.js";

/**
 * Community workspace (migrations 0054 and 0055), with real sessions and the real row level security:
 * who may build channels, who may read and write them, privilege escalation, ownership, invitations, reports, appeals,
 * attachments and notifications. Nothing here trusts the client: every check is made through the database.
 */

let owner, adminU, mod, member, member2, outsider, staff;
let community, announcements, general;
const op = () => crypto.randomUUID();
const rpc = (u, fn, args) => u.client.rpc(fn, args);
const send = (u, channel, body, extra = {}) =>
  rpc(u, "send_channel_message", { p_channel: channel, p_body: body, p_file_ids: extra.files ?? [], p_reply_to: extra.reply ?? null, p_client_op_id: extra.key ?? op() });
const code = (r) => String(r.error?.message ?? "");

async function makeFile(ownerId, { purpose = "message_attachment", width = null, height = null, status = "ready" } = {}) {
  const { data, error } = await admin.from("files").insert({
    owner_id: ownerId, bucket: "private", storage_key: `${purpose}/${ownerId}/${crypto.randomUUID()}.png`, purpose, mime_type: "image/png",
    size_bytes: 1234, original_name: "pic.png", width, height, status,
  }).select("id, storage_key").single();
  if (error) throw error;
  return data;
}

beforeAll(async () => {
  [owner, adminU, mod, member, member2, outsider, staff] = await Promise.all(
    ["cw-owner", "cw-admin", "cw-mod", "cw-member", "cw-member2", "cw-outsider", "cw-staff"].map((l) => createUser(l)),
  );
  await grantRoleDirect(staff.id, "global_admin");
  const { data, error } = await owner.client.from("communities")
    .insert({ created_by: owner.id, slug: `cw-${Date.now().toString(36)}`, name: "Workspace test", kind: "community", visibility: "public", join_policy: "open" })
    .select("id, slug").single();
  if (error) throw error;
  community = data;
  for (const u of [adminU, mod, member, member2]) expect((await rpc(u, "join_community", { p_community: community.id })).error).toBeNull();
  await rpc(owner, "set_community_member_role", { p_community: community.id, p_user: adminU.id, p_role: "admin" });
  await rpc(adminU, "set_community_member_role", { p_community: community.id, p_user: mod.id, p_role: "moderator" });
  const { data: chans } = await admin.from("community_channels").select("id, type").eq("community_id", community.id);
  announcements = chans.find((c) => c.type === "announcements").id;
  general = chans.find((c) => c.type === "text").id;
});
afterAll(cleanupUsers);

describe("structure", () => {
  it("gives a new community an announcements and a general channel", async () => {
    expect(announcements).toBeTruthy();
    expect(general).toBeTruthy();
    const { data: cats } = await owner.client.from("community_categories").select("name").eq("community_id", community.id);
    expect(cats.map((c) => c.name).sort()).toEqual(["Community", "Information"]);
  });

  it("lets an admin build categories and channels, and nobody below", async () => {
    const mk = (u, name) => rpc(u, "create_community_channel", { p_community: community.id, p_category: null, p_name: name, p_type: "text" });
    for (const u of [member, mod, outsider]) expect(code(await mk(u, "nope"))).toContain("forbidden");
    expect((await rpc(member, "create_community_category", { p_community: community.id, p_name: "Mine" })).error?.message).toContain("forbidden");
    const ok = await mk(adminU, "projects");
    expect(ok.error).toBeNull();
    expect(code(await mk(adminU, "Projects"))).toContain("name_taken"); // names are unique, ignoring case
    const cat = await rpc(adminU, "create_community_category", { p_community: community.id, p_name: "Work" });
    expect(cat.error).toBeNull();
  });

  it("cannot be written to directly: tables are read-only for members", async () => {
    const direct = await member.client.from("community_channels").insert({ community_id: community.id, name: "sneaky", type: "text" });
    expect(direct.error).not.toBeNull();
    const upd = await adminU.client.from("community_channels").update({ name: "renamed" }).eq("id", general).select();
    expect(upd.data ?? []).toHaveLength(0);
    const msg = await member.client.from("channel_messages").insert({ channel_id: general, community_id: community.id, author_id: member.id, body: "bypass" });
    expect(msg.error).not.toBeNull();
  });

  it("keeps the staff channel away from members and outsiders, in every read path", async () => {
    const created = await rpc(adminU, "create_community_channel", { p_community: community.id, p_category: null, p_name: "staff-room", p_type: "staff", p_min_view_role: "member", p_min_post_role: "member" });
    expect(created.error).toBeNull(); // a staff channel is forced up to moderators whatever was asked
    const staffChannel = created.data;
    const { data: row } = await admin.from("community_channels").select("min_view_role, min_post_role").eq("id", staffChannel).single();
    expect(row).toEqual({ min_view_role: "moderator", min_post_role: "moderator" });

    expect((await send(mod, staffChannel, "private mod talk secretword")).error).toBeNull();
    for (const u of [member, outsider]) {
      const list = await u.client.from("community_channels").select("id").eq("id", staffChannel);
      expect(list.data).toHaveLength(0);
      const msgs = await u.client.from("channel_messages").select("id").eq("channel_id", staffChannel);
      expect(msgs.data).toHaveLength(0);
      const page = await rpc(u, "channel_messages_page", { p_channel: staffChannel });
      expect(page.data ?? []).toHaveLength(0);
      expect(code(await send(u, staffChannel, "let me in"))).toContain("not_found");
    }
    // search is authorised by the same rules
    const found = await rpc(member, "search_channel_messages", { p_community: community.id, p_query: "secretword" });
    expect(found.data ?? []).toHaveLength(0);
    const foundMod = await rpc(mod, "search_channel_messages", { p_community: community.id, p_query: "secretword" });
    expect(foundMod.data).toHaveLength(1);
  });

  it("archived channels disappear for members but not for staff", async () => {
    const id = (await rpc(adminU, "create_community_channel", { p_community: community.id, p_category: null, p_name: "old-news", p_type: "text" })).data;
    expect((await send(member, id, "hello")).error).toBeNull();
    await rpc(adminU, "update_community_channel", {
      p_channel: id, p_name: "old-news", p_category: null, p_description: null, p_topic: null, p_rules: null,
      p_min_view_role: "member", p_min_post_role: "member", p_slow_mode: 0, p_allow_attachments: true, p_archived: true,
    });
    expect((await member.client.from("channel_messages").select("id").eq("channel_id", id)).data).toHaveLength(0);
    expect((await mod.client.from("channel_messages").select("id").eq("channel_id", id)).data).toHaveLength(1);
    expect(code(await send(member, id, "still here?"))).toContain("not_found");
    expect(code(await send(mod, id, "archived"))).toContain("archived");
  });
});

describe("roles and ownership", () => {
  it("prevents privilege escalation at every step", async () => {
    const setRole = (u, target, role) => rpc(u, "set_community_member_role", { p_community: community.id, p_user: target.id, p_role: role });
    expect(code(await setRole(member, member, "admin"))).toContain("forbidden");
    expect(code(await setRole(member, member2, "moderator"))).toContain("forbidden");
    expect(code(await setRole(mod, member, "moderator"))).toContain("forbidden");       // moderators appoint nobody
    expect(code(await setRole(adminU, member, "admin"))).toContain("forbidden");        // only the owner makes admins
    expect(code(await setRole(adminU, owner, "member"))).toContain("forbidden");        // the owner cannot be demoted
    expect(code(await setRole(mod, adminU, "member"))).toContain("forbidden");
    expect(code(await setRole(adminU, adminU, "moderator"))).toContain("forbidden");    // nobody edits themselves
    expect((await setRole(adminU, member2, "moderator")).error).toBeNull();
    expect((await setRole(adminU, member2, "member")).error).toBeNull();
    const roles = await admin.from("community_members").select("user_id, role").eq("community_id", community.id);
    expect(roles.data.find((r) => r.user_id === member.id).role).toBe("member");
    expect(roles.data.find((r) => r.user_id === owner.id).role).toBe("owner");
  });

  it("cannot be changed by writing the member table directly", async () => {
    const res = await member.client.from("community_members").update({ role: "owner" }).eq("community_id", community.id).eq("user_id", member.id).select();
    expect(res.data ?? []).toHaveLength(0);
    const { data } = await admin.from("community_members").select("role").eq("community_id", community.id).eq("user_id", member.id).single();
    expect(data.role).toBe("member");
  });

  it("never loses its owner: the owner cannot leave, and a transfer needs confirmation", async () => {
    expect(code(await rpc(owner, "leave_community", { p_community: community.id }))).toContain("owner_cannot_leave");
    expect(code(await rpc(adminU, "transfer_community_ownership", { p_community: community.id, p_user: adminU.id, p_confirm: community.slug }))).toContain("forbidden");
    expect(code(await rpc(owner, "transfer_community_ownership", { p_community: community.id, p_user: outsider.id, p_confirm: community.slug }))).toContain("invalid_target");
    expect(code(await rpc(owner, "transfer_community_ownership", { p_community: community.id, p_user: adminU.id, p_confirm: "wrong" }))).toContain("confirmation_mismatch");
    expect(code(await rpc(owner, "transfer_community_ownership", { p_community: community.id, p_user: owner.id, p_confirm: community.slug }))).toContain("invalid_target");
  });

  it("transfers ownership to exactly one new owner and keeps the previous one as an admin", async () => {
    const own2 = await createUser("cw-owner2");
    const slug = `cw-t-${Date.now().toString(36)}`;
    const { data: c } = await owner.client.from("communities").insert({ created_by: owner.id, slug, name: "Handover", kind: "community", visibility: "public", join_policy: "open" }).select("id").single();
    await rpc(own2, "join_community", { p_community: c.id });
    expect((await rpc(owner, "transfer_community_ownership", { p_community: c.id, p_user: own2.id, p_confirm: slug })).error).toBeNull();
    const { data: rows } = await admin.from("community_members").select("user_id, role").eq("community_id", c.id);
    expect(rows.filter((r) => r.role === "owner")).toEqual([{ user_id: own2.id, role: "owner" }]);
    expect(rows.find((r) => r.user_id === owner.id).role).toBe("admin");
    expect(code(await rpc(owner, "transfer_community_ownership", { p_community: c.id, p_user: owner.id, p_confirm: slug }))).toContain("forbidden"); // no longer the owner
    const { data: log } = await admin.from("community_audit_log").select("action").eq("community_id", c.id);
    expect(log.map((l) => l.action)).toContain("owner.transferred");
  });

  it("hides banned and pending people from ordinary members", async () => {
    const slug = `cw-v-${Date.now().toString(36)}`;
    const { data: c } = await owner.client.from("communities").insert({ created_by: owner.id, slug, name: "Visibility", kind: "community", visibility: "public", join_policy: "request" }).select("id").single();
    const [pend, ban] = await Promise.all([createUser("cw-pend"), createUser("cw-ban")]);
    await admin.from("community_members").insert([{ community_id: c.id, user_id: member.id, status: "active" }, { community_id: c.id, user_id: ban.id, status: "banned" }]);
    expect(await rpc(pend, "join_community", { p_community: c.id })).toMatchObject({ data: "pending" });
    const seen = await member.client.from("community_members").select("user_id, status").eq("community_id", c.id);
    expect(seen.data.map((r) => r.status).sort()).toEqual(["active", "active"]);
    const staffSees = await owner.client.from("community_members").select("user_id, status").eq("community_id", c.id);
    expect(staffSees.data.map((r) => r.status).sort()).toEqual(["active", "active", "banned", "pending"]);
  });
});

describe("posting rules", () => {
  it("keeps announcements to staff and honours read-only channels", async () => {
    expect(code(await send(member, announcements, "hi"))).toContain("read_only");
    expect((await send(mod, announcements, "Welcome everyone")).error).toBeNull();
    const ro = (await rpc(adminU, "create_community_channel", { p_community: community.id, p_category: null, p_name: "rules-only", p_type: "resources", p_min_post_role: "admin" })).data;
    expect(code(await send(mod, ro, "x"))).toContain("read_only");
    expect((await send(adminU, ro, "pinned info")).error).toBeNull();
    const direct = await admin.from("community_channels").update({ type: "announcements", min_post_role: "member" }).eq("id", ro);
    expect(direct.error).not.toBeNull(); // the table itself refuses an open announcement channel
  });

  it("stores one message per key even under a concurrent burst", async () => {
    const key = op();
    const results = await Promise.all(Array.from({ length: 6 }, () => send(member, general, "racing", { key })));
    expect(results.every((r) => r.error === null)).toBe(true);
    expect(new Set(results.map((r) => r.data.message.id)).size).toBe(1);
    expect(results.filter((r) => r.data.replayed).length).toBeGreaterThanOrEqual(5);
    const { data } = await admin.from("channel_messages").select("id").eq("client_op_id", key);
    expect(data).toHaveLength(1);
  });

  it("applies slow mode to members but not to staff", async () => {
    const id = (await rpc(adminU, "create_community_channel", { p_community: community.id, p_category: null, p_name: "slow", p_type: "text", p_slow_mode: 60 })).data;
    expect((await send(member, id, "first")).error).toBeNull();
    const second = await send(member, id, "second");
    expect(code(second)).toMatch(/slow_mode:\d+/);
    expect((await send(mod, id, "one")).error).toBeNull();
    expect((await send(mod, id, "two")).error).toBeNull();
  });

  it("refuses empty, oversized and bad-reference messages, and files that are not yours", async () => {
    expect(code(await send(member, general, "   "))).toContain("empty_message");
    expect(code(await send(member, general, "x".repeat(4001)))).toContain("empty_message");
    expect(code(await send(member, general, "reply", { reply: crypto.randomUUID() }))).toContain("invalid_reply");
    const theirs = await makeFile(member2.id);
    expect(code(await send(member, general, "stolen file", { files: [theirs.id] }))).toContain("invalid_file");
    const pending = await makeFile(member.id, { status: "pending" });
    expect(code(await send(member, general, "not ready", { files: [pending.id] }))).toContain("invalid_file");
    const wrong = await makeFile(member.id, { purpose: "avatar" });
    expect(code(await send(member, general, "wrong purpose", { files: [wrong.id] }))).toContain("invalid_file");
    const many = await Promise.all(Array.from({ length: 6 }, () => makeFile(member.id)));
    expect(code(await send(member, general, "too many", { files: many.map((f) => f.id) }))).toContain("too_many_files");
  });

  it("times a member out, and lets them post again afterwards", async () => {
    const t = await createUser("cw-timeout");
    await rpc(t, "join_community", { p_community: community.id });
    expect(code(await rpc(member, "moderate_member", { p_community: community.id, p_user: t.id, p_action: "timeout", p_reason: "x", p_hours: 1 }))).toContain("forbidden");
    const res = await rpc(mod, "moderate_member", { p_community: community.id, p_user: t.id, p_action: "timeout", p_reason: "Cool off for a bit", p_hours: 2 });
    expect(res.error).toBeNull();
    expect(code(await send(t, general, "I can still talk?"))).toContain("timed_out");
    expect((await rpc(mod, "moderate_member", { p_community: community.id, p_user: t.id, p_action: "clear_timeout", p_reason: null })).error).toBeNull();
    expect((await send(t, general, "back")).error).toBeNull();
  });

  it("asks for the rules to be accepted when the community requires it", async () => {
    const slug = `cw-r-${Date.now().toString(36)}`;
    const { data: c } = await owner.client.from("communities").insert({ created_by: owner.id, slug, name: "Rules", kind: "community", visibility: "public", join_policy: "open" }).select("id").single();
    await rpc(owner, "update_community_details", {
      p_community: c.id, p_name: "Rules", p_kind: "community", p_description: null, p_visibility: "public", p_join_policy: "open",
      p_rules: "Be kind.", p_topics: ["study", "Study "], p_require_rules_ack: true, p_invite_policy: "staff",
    });
    await rpc(member, "join_community", { p_community: c.id });
    const ch = (await admin.from("community_channels").select("id").eq("community_id", c.id).eq("type", "text").single()).data.id;
    expect(code(await send(member, ch, "hello"))).toContain("rules_required");
    expect((await rpc(member, "acknowledge_community_rules", { p_community: c.id })).error).toBeNull();
    expect((await send(member, ch, "hello")).error).toBeNull();
    expect((await admin.from("communities").select("topics").eq("id", c.id).single()).data.topics).toEqual(["study"]); // normalised and de-duplicated
  });
});

describe("editing, deleting and pinning", () => {
  it("lets only the author edit, and shows an edited mark", async () => {
    const m = (await send(member, general, "original")).data.message;
    expect(code(await rpc(member2, "edit_channel_message", { p_message: m.id, p_body: "hijack" }))).toContain("not_found");
    expect(code(await rpc(adminU, "edit_channel_message", { p_message: m.id, p_body: "admin edit" }))).toContain("not_found");
    const edited = await rpc(member, "edit_channel_message", { p_message: m.id, p_body: "changed" });
    expect(edited.data.body).toBe("changed");
    expect(edited.data.edited_at).not.toBeNull();
  });

  it("lets a moderator remove a member's message, but never an admin's", async () => {
    const mine = (await send(member, general, "rude words")).data.message;
    expect(code(await rpc(member2, "delete_channel_message", { p_message: mine.id }))).toContain("forbidden");
    const adminMsg = (await send(adminU, general, "admin says")).data.message;
    expect(code(await rpc(mod, "delete_channel_message", { p_message: adminMsg.id, p_reason: "no" }))).toContain("forbidden");
    const removed = await rpc(mod, "delete_channel_message", { p_message: mine.id, p_reason: "Not respectful" });
    expect(removed.data.status).toBe("removed");
    const { data: row } = await admin.from("channel_messages").select("body, status, attachments").eq("id", mine.id).single();
    expect(row).toEqual({ body: "", status: "removed", attachments: [] });
    const { data: act } = await admin.from("community_mod_actions").select("action, target_user_id").eq("community_id", community.id).eq("action", "remove_message");
    expect(act.some((a) => a.target_user_id === member.id)).toBe(true);
    const { data: note } = await admin.from("notifications").select("type").eq("user_id", member.id).eq("type", "moderation_community_action");
    expect(note.length).toBeGreaterThan(0);
    // a removed message cannot be edited back to life
    const again = await admin.from("channel_messages").update({ status: "sent", body: "back" }).eq("id", mine.id).select("body, status").single();
    expect(again.data).toEqual({ body: "", status: "removed" });
  });

  it("pins and unpins only for moderators, with a bounded count", async () => {
    const m = (await send(member, general, "worth pinning")).data.message;
    expect(code(await rpc(member, "pin_channel_message", { p_message: m.id, p_pinned: true }))).toContain("forbidden");
    expect((await rpc(mod, "pin_channel_message", { p_message: m.id, p_pinned: true })).error).toBeNull();
    const { data } = await member.client.from("channel_messages").select("id").eq("channel_id", general).not("pinned_at", "is", null);
    expect(data.map((r) => r.id)).toContain(m.id);
    expect((await rpc(mod, "pin_channel_message", { p_message: m.id, p_pinned: false })).error).toBeNull();
  });

  it("pages by cursor in both directions without repeating a message", async () => {
    const ch = (await rpc(adminU, "create_community_channel", { p_community: community.id, p_category: null, p_name: "paging", p_type: "text" })).data;
    for (let i = 0; i < 7; i++) await send(member, ch, `m${i}`);
    const first = await rpc(member, "channel_messages_page", { p_channel: ch, p_limit: 3 });
    expect(first.data.map((m) => m.body)).toEqual(["m6", "m5", "m4"]);
    const last = first.data.at(-1);
    const older = await rpc(member, "channel_messages_page", { p_channel: ch, p_before_ts: last.created_at, p_before_id: last.id, p_limit: 10 });
    expect(older.data.map((m) => m.body)).toEqual(["m3", "m2", "m1", "m0"]);
    const newest = first.data[0];
    const none = await rpc(member, "channel_messages_page", { p_channel: ch, p_after_ts: newest.created_at, p_after_id: newest.id });
    expect(none.data).toHaveLength(0);
    await send(member, ch, "m7");
    const caught = await rpc(member, "channel_messages_page", { p_channel: ch, p_after_ts: newest.created_at, p_after_id: newest.id });
    expect(caught.data.map((m) => m.body)).toEqual(["m7"]);
  });

  it("counts unread messages and clears them when the channel is read", async () => {
    const ch = (await rpc(adminU, "create_community_channel", { p_community: community.id, p_category: null, p_name: "unread", p_type: "text" })).data;
    await send(member, ch, "one");
    await send(member, ch, "two");
    const before = (await rpc(member2, "community_channel_unread", { p_community: community.id })).data.find((r) => r.channel_id === ch);
    expect(Number(before.unread)).toBe(2);
    const ownCount = (await rpc(member, "community_channel_unread", { p_community: community.id })).data.find((r) => r.channel_id === ch);
    expect(Number(ownCount.unread)).toBe(0); // your own messages are never unread
    await rpc(member2, "mark_channel_read", { p_channel: ch });
    const after = (await rpc(member2, "community_channel_unread", { p_community: community.id })).data.find((r) => r.channel_id === ch);
    expect(Number(after.unread)).toBe(0);
    expect(code(await rpc(outsider, "mark_channel_read", { p_channel: ch }))).toContain("not_found");
  });
});

describe("attachments", () => {
  it("lets members open a channel file and nobody else, and ends access when the message is deleted", async () => {
    const f = await makeFile(member.id);
    const m = (await send(member, general, "with a picture", { files: [f.id] })).data.message;
    expect(m.attachments).toHaveLength(1);
    const read = (u) => u.client.from("files").select("id").eq("id", f.id);
    expect((await read(member2)).data).toHaveLength(1);
    expect((await read(outsider)).data).toHaveLength(0);
    // the same file cannot be reused in a second message
    expect(code(await send(member, general, "again", { files: [f.id] }))).toContain("invalid_file");
    expect((await rpc(member, "delete_channel_message", { p_message: m.id })).data.status).toBe("deleted");
    expect((await read(member2)).data).toHaveLength(0);
    const { data: file } = await admin.from("files").select("orphaned_at").eq("id", f.id).single();
    expect(file.orphaned_at).not.toBeNull();
    const { data: swept } = await admin.rpc("orphan_files", { p_limit: 200 });
    expect(Array.isArray(swept)).toBe(true);
  });

  it("does not let a private channel's file be read by someone who only knows its id", async () => {
    const staffCh = (await admin.from("community_channels").select("id").eq("community_id", community.id).eq("type", "staff").limit(1).single()).data.id;
    const f = await makeFile(mod.id);
    await send(mod, staffCh, "staff file", { files: [f.id] });
    expect((await member.client.from("files").select("id").eq("id", f.id)).data).toHaveLength(0);
    expect((await mod.client.from("files").select("id").eq("id", f.id)).data).toHaveLength(1);
  });

  it("fixes the direct-message defect: a deleted message's file stops being readable", async () => {
    const [a, b] = await Promise.all([createUser("cw-dm-a"), createUser("cw-dm-b")]);
    await admin.from("profiles").update({ allow_messages_from: "everyone" }).in("id", [a.id, b.id]);
    const conv = (await rpc(a, "start_direct_conversation", { p_other: b.id })).data;
    const f = await makeFile(a.id);
    const sent = await rpc(a, "send_message", { p_conversation: conv, p_body: "see this", p_file_ids: [f.id], p_client_op_id: op() });
    expect(sent.error).toBeNull();
    expect((await b.client.from("files").select("id").eq("id", f.id)).data).toHaveLength(1);
    await a.client.from("messages").update({ status: "deleted" }).eq("id", sent.data.message.id);
    expect((await b.client.from("files").select("id").eq("id", f.id)).data).toHaveLength(0);
    const { data: file } = await admin.from("files").select("orphaned_at").eq("id", f.id).single();
    expect(file.orphaned_at).not.toBeNull();
  });
});

describe("branding", () => {
  it("accepts a square icon and a 3:1 banner from an admin, and nothing else", async () => {
    const icon = await makeFile(adminU.id, { purpose: "community_image", width: 512, height: 512 });
    const banner = await makeFile(adminU.id, { purpose: "community_image", width: 1500, height: 500 });
    const wide = await makeFile(adminU.id, { purpose: "community_image", width: 800, height: 400 });
    expect(code(await rpc(member, "set_community_branding", { p_community: community.id, p_kind: "icon", p_file: icon.id }))).toContain("forbidden");
    expect(code(await rpc(adminU, "set_community_branding", { p_community: community.id, p_kind: "icon", p_file: wide.id }))).toContain("invalid_proportions");
    expect(code(await rpc(adminU, "set_community_branding", { p_community: community.id, p_kind: "banner", p_file: icon.id }))).toContain("invalid_proportions");
    const others = await makeFile(member.id, { purpose: "community_image", width: 512, height: 512 });
    expect(code(await rpc(adminU, "set_community_branding", { p_community: community.id, p_kind: "icon", p_file: others.id }))).toContain("invalid_image");
    expect((await rpc(adminU, "set_community_branding", { p_community: community.id, p_kind: "icon", p_file: icon.id })).error).toBeNull();
    expect((await rpc(adminU, "set_community_branding", { p_community: community.id, p_kind: "banner", p_file: banner.id })).error).toBeNull();
    const { data } = await admin.from("communities").select("avatar_key, cover_key").eq("id", community.id).single();
    expect(data).toEqual({ avatar_key: icon.storage_key, cover_key: banner.storage_key });

    // replacing the icon releases the old file to the sweep
    const icon2 = await makeFile(adminU.id, { purpose: "community_image", width: 256, height: 256 });
    await rpc(adminU, "set_community_branding", { p_community: community.id, p_kind: "icon", p_file: icon2.id });
    expect((await admin.from("files").select("orphaned_at").eq("id", icon.id).single()).data.orphaned_at).not.toBeNull();
    expect((await rpc(adminU, "set_community_branding", { p_community: community.id, p_kind: "banner", p_file: null })).error).toBeNull();
    expect((await admin.from("communities").select("cover_key").eq("id", community.id).single()).data.cover_key).toBeNull();
  });

  it("no longer lets an admin write the image columns directly (defect D1)", async () => {
    const res = await adminU.client.from("communities").update({ avatar_key: "avatar/someone/else.png" }).eq("id", community.id).select();
    expect(res.error ?? res.data?.length === 0).toBeTruthy();
    const { data } = await admin.from("communities").select("avatar_key").eq("id", community.id).single();
    expect(data.avatar_key).not.toBe("avatar/someone/else.png");
  });
});

describe("invitations", () => {
  const invite = async (u, opts = {}) =>
    rpc(u, "create_community_invite", { p_community: community.id, p_hours: opts.hours ?? 24, p_max_uses: opts.max ?? null, p_invitee: opts.invitee ?? null, p_note: null });

  it("lets staff create invites and members only when the community allows it", async () => {
    expect((await invite(mod)).error).toBeNull();
    expect(code(await invite(member))).toContain("forbidden");
    expect(code(await invite(outsider))).toContain("not_found");
  });

  it("stores only a hash, previews without detail for a bad code, and joins once per person", async () => {
    const { data } = await invite(adminU, { max: 2 });
    const stored = await admin.from("community_invites").select("code_hash, code_hint").eq("id", data.id).single();
    expect(stored.data.code_hash).not.toContain(data.code);
    expect(stored.data.code_hash).toHaveLength(64);

    const p = await rpc(outsider, "preview_community_invite", { p_code: data.code });
    expect(p.data).toMatchObject({ valid: true, already_member: false, name: "Workspace test" });
    expect(p.data.slug).toBeNull(); // a preview does not hand out the address
    expect((await rpc(outsider, "preview_community_invite", { p_code: "0".repeat(24) })).data).toEqual({ valid: false });
    expect((await rpc(outsider, "preview_community_invite", { p_code: "garbage" })).data).toEqual({ valid: false });

    const first = await rpc(outsider, "redeem_community_invite", { p_code: data.code });
    expect(first.data).toBe(community.slug);
    expect((await rpc(outsider, "redeem_community_invite", { p_code: data.code })).data).toBe(community.slug); // already in: no second use is spent
    expect((await admin.from("community_invites").select("uses").eq("id", data.id).single()).data.uses).toBe(1);
    await admin.from("community_members").delete().eq("community_id", community.id).eq("user_id", outsider.id);
  });

  it("refuses expired, revoked, exhausted and someone else's named invites with one indistinguishable answer", async () => {
    const e = await invite(adminU);
    await admin.from("community_invites").update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq("id", e.data.id);
    const r = await invite(adminU);
    await rpc(adminU, "revoke_community_invite", { p_invite: r.data.id });
    const one = await invite(adminU, { max: 1 });
    expect((await rpc(member2, "redeem_community_invite", { p_code: one.data.code })).data).toBe(community.slug); // member2 is already in
    const fresh = await createUser("cw-inv-a");
    const fresh2 = await createUser("cw-inv-b");
    const single = await invite(adminU, { max: 1 });
    expect((await rpc(fresh, "redeem_community_invite", { p_code: single.data.code })).error).toBeNull();
    for (const bad of [e.data.code, r.data.code, single.data.code]) {
      expect(code(await rpc(fresh2, "redeem_community_invite", { p_code: bad }))).toContain("invite_invalid");
    }
    const named = await invite(adminU, { invitee: fresh2.id });
    expect(code(await rpc(outsider, "redeem_community_invite", { p_code: named.data.code }))).toContain("invite_invalid");
    expect((await rpc(fresh2, "redeem_community_invite", { p_code: named.data.code })).data).toBe(community.slug);
    const { data: n } = await admin.from("notifications").select("type").eq("user_id", fresh2.id).eq("type", "community_invite");
    expect(n.length).toBe(1);
  });

  it("does not let a banned person back in through an invite", async () => {
    const bad = await createUser("cw-banned");
    await rpc(bad, "join_community", { p_community: community.id });
    expect((await rpc(adminU, "moderate_member", { p_community: community.id, p_user: bad.id, p_action: "ban", p_reason: "Repeated spam" })).error).toBeNull();
    const { data } = await invite(adminU);
    expect(code(await rpc(bad, "redeem_community_invite", { p_code: data.code }))).toContain("invite_invalid");
    expect((await rpc(bad, "preview_community_invite", { p_code: data.code })).data).toEqual({ valid: false });
    expect(code(await rpc(bad, "join_community", { p_community: community.id }))).toContain("banned");
  });

  it("shows invite metadata to staff only, never the code", async () => {
    const list = await mod.client.from("community_invites").select("id, code_hint").eq("community_id", community.id);
    expect(list.data.length).toBeGreaterThan(0);
    expect((await member.client.from("community_invites").select("id").eq("community_id", community.id)).data).toHaveLength(0);
    const leak = await mod.client.from("community_invites").select("code_hash").eq("community_id", community.id);
    expect(leak.error).not.toBeNull(); // the hash column is not readable at all
  });
});

describe("reports, moderation and appeals", () => {
  let reportedMsg, report;

  it("lets a member report a message once, with the evidence kept", async () => {
    reportedMsg = (await send(member2, general, "an unkind remark")).data.message;
    const r = await rpc(member, "submit_community_report", { p_community: community.id, p_target_type: "channel_message", p_target_id: reportedMsg.id, p_category: "harassment", p_details: "targeted at me" });
    expect(r.error).toBeNull();
    expect(r.data.duplicate).toBe(false);
    report = r.data.id;
    const again = await rpc(member, "submit_community_report", { p_community: community.id, p_target_type: "channel_message", p_target_id: reportedMsg.id, p_category: "harassment", p_details: null });
    expect(again.data).toEqual({ id: report, duplicate: true });
    const { data: row } = await admin.from("community_reports").select("snapshot, severity, target_user_id").eq("id", report).single();
    expect(row.snapshot.body).toBe("an unkind remark");
    expect(row.target_user_id).toBe(member2.id);
    expect(code(await rpc(member2, "submit_community_report", { p_community: community.id, p_target_type: "channel_message", p_target_id: reportedMsg.id, p_category: "spam" }))).toContain("invalid_target");
    expect(code(await rpc(outsider, "submit_community_report", { p_community: community.id, p_target_type: "channel_message", p_target_id: reportedMsg.id, p_category: "spam" }))).toContain("not_found");
  });

  it("shows the report to staff who outrank the reported person, never to the reported person or other members", async () => {
    expect((await mod.client.from("community_reports").select("id").eq("id", report)).data).toHaveLength(1);
    expect((await adminU.client.from("community_reports").select("id").eq("id", report)).data).toHaveLength(1);
    expect((await member.client.from("community_reports").select("id").eq("id", report)).data).toHaveLength(1); // the reporter's own
    expect((await member2.client.from("community_reports").select("id").eq("id", report)).data).toHaveLength(0);
    expect((await outsider.client.from("community_reports").select("id").eq("id", report)).data).toHaveLength(0);
    expect((await staff.client.from("community_reports").select("id").eq("id", report)).data).toHaveLength(0); // platform staff see escalations only
  });

  it("does not show a moderator a report about an admin, and sends reports about the owner to the platform team", async () => {
    const msg = (await send(adminU, general, "admin remark")).data.message;
    const r = await rpc(member, "submit_community_report", { p_community: community.id, p_target_type: "channel_message", p_target_id: msg.id, p_category: "spam" });
    expect((await mod.client.from("community_reports").select("id").eq("id", r.data.id)).data).toHaveLength(0);
    expect((await owner.client.from("community_reports").select("id").eq("id", r.data.id)).data).toHaveLength(1);
    expect(code(await rpc(mod, "update_community_report", { p_report: r.data.id, p_status: "dismissed" }))).toContain("not_found");

    const ownerMsg = (await send(owner, general, "owner remark")).data.message;
    const rr = await rpc(member, "submit_community_report", { p_community: community.id, p_target_type: "channel_message", p_target_id: ownerMsg.id, p_category: "spam" });
    const esc = await admin.from("community_reports").select("escalated_at").eq("id", rr.data.id).single();
    expect(esc.data.escalated_at).not.toBeNull();
    expect((await staff.client.from("community_reports").select("id").eq("id", rr.data.id)).data).toHaveLength(1);
    expect((await owner.client.from("community_reports").select("id").eq("id", rr.data.id)).data).toHaveLength(0); // not their own report
  });

  it("lets a moderator act on a report and records it so the member can appeal", async () => {
    expect((await rpc(mod, "update_community_report", { p_report: report, p_status: "reviewing" })).error).toBeNull();
    const act = await rpc(mod, "moderate_member", { p_community: community.id, p_user: member2.id, p_action: "timeout", p_reason: "Unkind remark", p_hours: 3, p_report: report });
    expect(act.error).toBeNull();
    expect((await admin.from("community_reports").select("status").eq("id", report).single()).data.status).toBe("action_taken");
    const seen = await member2.client.from("community_mod_actions").select("id, action, reason").eq("community_id", community.id);
    expect(seen.data.map((a) => a.action)).toContain("timeout");
    // private notes are not shown to the person they are about
    await rpc(mod, "moderate_member", { p_community: community.id, p_user: member2.id, p_action: "note", p_reason: "Second time this month" });
    expect((await member2.client.from("community_mod_actions").select("action").eq("community_id", community.id).eq("action", "note")).data).toHaveLength(0);
    expect((await adminU.client.from("community_mod_actions").select("action").eq("community_id", community.id).eq("action", "note")).data.length).toBeGreaterThan(0);
    expect(code(await rpc(mod, "moderate_member", { p_community: community.id, p_user: adminU.id, p_action: "timeout", p_reason: "x", p_hours: 1 }))).toContain("forbidden");
    expect(code(await rpc(adminU, "moderate_member", { p_community: community.id, p_user: owner.id, p_action: "ban", p_reason: "mutiny" }))).toContain("forbidden");
    expect(code(await rpc(mod, "moderate_member", { p_community: community.id, p_user: member.id, p_action: "ban", p_reason: "not allowed" }))).toContain("forbidden"); // bans are an admin power
    appealAction = seen.data.find((a) => a.action === "timeout").id;
  });

  let appealAction;
  it("runs an appeal: only the person acted on may appeal, someone else decides, and upholding lifts the timeout", async () => {
    expect(code(await rpc(member, "submit_community_appeal", { p_action: appealAction, p_message: "this is not mine to appeal" }))).toContain("not_found");
    expect(code(await rpc(member2, "submit_community_appeal", { p_action: appealAction, p_message: "short" }))).toContain("message_too_short");
    const ap = await rpc(member2, "submit_community_appeal", { p_action: appealAction, p_message: "I was quoting someone else, please read the thread again." });
    expect(ap.error).toBeNull();
    expect(code(await rpc(member2, "submit_community_appeal", { p_action: appealAction, p_message: "trying a second time please" }))).toContain("already_appealed");
    expect((await admin.from("community_reports").select("status").eq("id", report).single()).data.status).toBe("appealed");
    expect((await member.client.from("community_appeals").select("id").eq("id", ap.data)).data).toHaveLength(0);
    // the moderator who acted cannot review it; nor can a plain member
    expect(code(await rpc(mod, "review_community_appeal", { p_appeal: ap.data, p_decision: "denied" }))).toContain("not_found");
    expect(code(await rpc(member, "review_community_appeal", { p_appeal: ap.data, p_decision: "denied" }))).toContain("not_found");
    expect((await rpc(adminU, "review_community_appeal", { p_appeal: ap.data, p_decision: "upheld", p_note: "Context confirmed" })).error).toBeNull();
    expect((await admin.from("community_members").select("muted_until").eq("community_id", community.id).eq("user_id", member2.id).single()).data.muted_until).toBeNull();
    expect((await send(member2, general, "I am back")).error).toBeNull();
    expect((await admin.from("community_reports").select("status").eq("id", report).single()).data.status).toBe("dismissed");
    expect(code(await rpc(adminU, "review_community_appeal", { p_appeal: ap.data, p_decision: "denied" }))).toContain("not_found"); // decided once
  });

  it("sends an appeal against the owner's own decision to the platform team", async () => {
    const t = await createUser("cw-owner-victim");
    await rpc(t, "join_community", { p_community: community.id });
    // the owner outranks everyone: they can ban directly
    const act = await rpc(owner, "moderate_member", { p_community: community.id, p_user: t.id, p_action: "ban", p_reason: "Personal disagreement" });
    expect(act.error).toBeNull();
    const ap = await rpc(t, "submit_community_appeal", { p_action: act.data, p_message: "Please look at this, it was personal and unfair." });
    expect(ap.error).toBeNull();
    expect((await admin.from("community_appeals").select("escalated_at").eq("id", ap.data).single()).data.escalated_at).not.toBeNull();
    expect(code(await rpc(adminU, "review_community_appeal", { p_appeal: ap.data, p_decision: "upheld" }))).toContain("not_found");
    expect(code(await rpc(member, "admin_review_community_appeal", { p_appeal: ap.data, p_decision: "upheld" }))).toContain("forbidden");
    expect((await rpc(staff, "admin_review_community_appeal", { p_appeal: ap.data, p_decision: "upheld", p_note: "Ban lifted" })).error).toBeNull();
    expect((await admin.from("community_members").select("status").eq("community_id", community.id).eq("user_id", t.id).single()).data.status).toBe("active");
  });

  it("gives platform staff the escalated queue and nothing else", async () => {
    const q = await rpc(staff, "admin_escalated_community_reports", {});
    expect(q.error).toBeNull();
    expect(q.data.length).toBeGreaterThan(0);
    expect(q.data.every((r) => r.snapshot !== undefined)).toBe(true);
    expect(code(await rpc(member, "admin_escalated_community_reports", {})).length === 0 || (await rpc(member, "admin_escalated_community_reports", {})).data?.length === 0).toBe(true);
    const target = q.data[0];
    expect(code(await rpc(member, "admin_resolve_community_report", { p_report: target.id, p_status: "dismissed" }))).toContain("forbidden");
    expect(code(await rpc(member, "admin_community_overview", {})) === "" && ((await rpc(member, "admin_community_overview", {})).data ?? []).length === 0).toBe(true);
    expect(code(await rpc(member, "admin_community_trends", {}))).toContain("forbidden");
    expect(code(await rpc(member, "admin_community_health", {}))).toContain("forbidden");
    const done = await rpc(staff, "admin_resolve_community_report", { p_report: target.id, p_status: "dismissed", p_resolution: "No violation found" });
    expect(done.error).toBeNull();
  });
});

describe("notifications", () => {
  let talker;
  beforeAll(async () => {
    // a fresh sender: the per-minute send limit is per author, and the earlier tests used up the others'
    talker = await createUser("cw-talker");
    await rpc(talker, "join_community", { p_community: community.id });
  });

  it("limits how fast one person can post", async () => {
    const spammer = await createUser("cw-spammer");
    await rpc(spammer, "join_community", { p_community: community.id });
    const results = [];
    for (let i = 0; i < 22; i++) results.push(await send(spammer, general, `spam ${i}`));
    expect(results.filter((r) => r.error === null)).toHaveLength(20);
    expect(code(results[20])).toContain("rate_limited");
  });

  it("notifies a mention once, honours mutes, and never notifies for every message", async () => {
    const before = async (u, type) => (await admin.from("notifications").select("id").eq("user_id", u.id).eq("type", type)).data.length;
    const m0 = await before(member2, "channel_mention");
    await send(talker, general, `hello @${member2.username} and @${outsider.username} welcome`);
    expect(await before(member2, "channel_mention")).toBe(m0 + 1);
    expect(await before(outsider, "channel_mention")).toBe(0); // not in the community: never notified, never named in `mentions`
    await send(talker, general, "just chatting, no mention");
    expect(await before(member2, "channel_mention")).toBe(m0 + 1);

    expect((await rpc(member2, "set_community_notify_pref", { p_community: community.id, p_channel: general, p_level: "none" })).error).toBeNull();
    await send(talker, general, `ping @${member2.username} again`);
    expect(await before(member2, "channel_mention")).toBe(m0 + 1);
    expect((await rpc(member2, "set_community_notify_pref", { p_community: community.id, p_channel: general, p_level: "mentions" })).error).toBeNull();
    await send(talker, general, `ping @${member2.username} once more`);
    expect(await before(member2, "channel_mention")).toBe(m0 + 2);
    const noPrivate = await send(talker, general, `try @${staff.username}`);
    expect(noPrivate.data.message.mentions).toEqual([]);
  });

  it("notifies the author of the message replied to, unless they muted the community", async () => {
    const mine = (await send(member2, general, "a question")).data.message;
    const before = (await admin.from("notifications").select("id").eq("user_id", member2.id).eq("type", "channel_reply")).data.length;
    await send(talker, general, "an answer", { reply: mine.id });
    expect((await admin.from("notifications").select("id").eq("user_id", member2.id).eq("type", "channel_reply")).data.length).toBe(before + 1);
    await rpc(member2, "set_community_notify_pref", { p_community: community.id, p_channel: null, p_level: "none", p_mute_hours: 8 });
    await send(talker, general, "another answer", { reply: mine.id });
    expect((await admin.from("notifications").select("id").eq("user_id", member2.id).eq("type", "channel_reply")).data.length).toBe(before + 1);
    await rpc(member2, "set_community_notify_pref", { p_community: community.id, p_channel: null, p_level: "mentions" });
  });

  it("fans an announcement out in the background, once per person, skipping muted members", async () => {
    await rpc(member2, "set_community_notify_pref", { p_community: community.id, p_channel: announcements, p_level: "none" });
    const posted = await send(mod, announcements, "Exam week schedule is up");
    expect(posted.error).toBeNull();
    const forThis = (u) => admin.from("notifications").select("id").eq("type", "channel_announcement").eq("user_id", u.id).eq("data->>message", posted.data.message.id);
    expect((await forThis(member)).data).toHaveLength(0); // not yet: the worker sends it
    expect((await admin.rpc("process_channel_announcements", { p_limit: 50 })).error).toBeNull();
    expect((await admin.rpc("process_channel_announcements", { p_limit: 50 })).error).toBeNull(); // a second run is harmless
    expect((await forThis(member)).data).toHaveLength(1);
    expect((await forThis(member2)).data).toHaveLength(0);
    expect((await forThis(mod)).data).toHaveLength(0); // not to the author
    expect((await admin.from("channel_messages").select("announce_state").eq("id", posted.data.message.id).single()).data.announce_state).toBe("done");
    const body = (await admin.from("notifications").select("data").eq("type", "channel_announcement").eq("user_id", member.id).eq("data->>message", posted.data.message.id).single()).data.data;
    expect(JSON.stringify(body)).not.toContain("Exam week"); // the text of a message never travels in a notification
  });
});

describe("leaving", () => {
  it("removes a leaver's read positions and preferences but keeps their messages", async () => {
    const l = await createUser("cw-leaver");
    await rpc(l, "join_community", { p_community: community.id });
    const m = (await send(l, general, "I was here")).data.message;
    await rpc(l, "mark_channel_read", { p_channel: general });
    await rpc(l, "set_community_notify_pref", { p_community: community.id, p_channel: general, p_level: "none" });
    expect((await rpc(l, "leave_community", { p_community: community.id })).error).toBeNull();
    expect((await admin.from("channel_reads").select("user_id").eq("user_id", l.id)).data).toHaveLength(0);
    expect((await admin.from("community_notify_prefs").select("user_id").eq("user_id", l.id)).data).toHaveLength(0);
    expect((await admin.from("channel_messages").select("id").eq("id", m.id)).data).toHaveLength(1);
    expect((await l.client.from("channel_messages").select("id").eq("id", m.id)).data).toHaveLength(0); // and no longer readable by them
    expect(code(await send(l, general, "back door"))).toContain("not_found");
  });
});

describe("audit and admin", () => {
  it("records permission changes and settings, readable by admins and the platform team only", async () => {
    const { data } = await adminU.client.from("community_audit_log").select("action").eq("community_id", community.id);
    const actions = data.map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(["role.changed", "channel.created", "message.removed", "member.ban", "invite.created"]));
    expect((await member.client.from("community_audit_log").select("id").eq("community_id", community.id)).data).toHaveLength(0);
    expect((await mod.client.from("community_audit_log").select("id").eq("community_id", community.id)).data).toHaveLength(0);
    expect((await staff.client.from("community_audit_log").select("id").eq("community_id", community.id)).data.length).toBeGreaterThan(0);
    const del = await adminU.client.from("community_audit_log").delete().eq("community_id", community.id);
    expect((await admin.from("community_audit_log").select("id").eq("community_id", community.id)).data.length).toBeGreaterThan(0);
    expect(del.error ?? true).toBeTruthy();
  });

  it("lets platform staff manage communities without reading private channel text", async () => {
    const list = await rpc(staff, "admin_community_overview", { p_query: "Workspace test" });
    expect(list.data.length).toBeGreaterThan(0);
    const detail = await rpc(staff, "admin_community_detail", { p_community: community.id });
    expect(detail.data.channels.length).toBeGreaterThan(2);
    expect(JSON.stringify(detail.data)).not.toContain("secretword");
    expect((await staff.client.from("channel_messages").select("id").eq("community_id", community.id)).data).toHaveLength(0);
    const trends = await rpc(staff, "admin_community_trends", { p_days: 3 });
    expect(trends.data).toHaveLength(3);
    expect(Number(trends.data.at(-1).messages)).toBeGreaterThan(0);
    const health = await rpc(staff, "admin_community_health", {});
    expect(health.data).toHaveProperty("uploads_stuck");
    expect(code(await rpc(member, "admin_community_detail", { p_community: community.id }))).toContain("forbidden");
  });

  it("erases closed-report evidence after the retention period but keeps the outcome", async () => {
    const rep = (await admin.from("community_reports").select("id").eq("community_id", community.id).eq("status", "dismissed").limit(1).single()).data.id;
    await admin.from("community_reports").update({ resolved_at: new Date(Date.now() - 400 * 86400_000).toISOString() }).eq("id", rep);
    expect((await admin.rpc("purge_community_report_evidence")).data).toBeGreaterThan(0);
    const { data } = await admin.from("community_reports").select("snapshot, status, evidence_purged_at").eq("id", rep).single();
    expect(data.snapshot).toEqual({});
    expect(data.status).toBe("dismissed");
    expect(data.evidence_purged_at).not.toBeNull();
  });

  it("erases a member's channel messages when they ask for their messages to go with the account", async () => {
    const e = await createUser("cw-erase");
    await rpc(e, "join_community", { p_community: community.id });
    const m = (await send(e, general, "please forget me")).data.message;
    const res = await admin.rpc("erase_user_data", { p_user: e.id, p_erase_messages: true });
    expect(res.error).toBeNull();
    expect((await admin.from("channel_messages").select("body, status").eq("id", m.id).single()).data).toEqual({ body: "", status: "deleted" });
  });
});

describe("the interface's idea of each role matches the database", () => {
  it("lists exactly the permissions stored in community_role_permissions", async () => {
    const { data } = await admin.from("community_role_permissions").select("role, permission");
    for (const role of ["member", "moderator", "admin", "owner"]) {
      const stored = data.filter((r) => r.role === role).map((r) => r.permission).sort();
      expect(stored, role).toEqual([...PERMISSIONS[role]].sort());
    }
  });
});

describe("reporting a whole community", () => {
  it("lands in the platform report queue once per reporter, and is refused for a community the reporter cannot see", async () => {
    const r = await rpc(member, "report_community", { p_community: community.id, p_category: "spam", p_details: "looks like an ad" });
    expect(r.error).toBeNull();
    expect(r.data.duplicate).toBe(false);
    const again = await rpc(member, "report_community", { p_community: community.id, p_category: "spam" });
    expect(again.data).toEqual({ id: r.data.id, duplicate: true });
    const { data: row } = await admin.from("reports").select("target_type, target_id, snapshot").eq("id", r.data.id).single();
    expect(row).toMatchObject({ target_type: "community", target_id: community.id });
    expect(row.snapshot.name).toBe("Workspace test");

    const hidden = await admin.from("communities").insert({ created_by: owner.id, slug: `cw-h-${Date.now().toString(36)}`, name: "Hidden", kind: "community", visibility: "private", join_policy: "invite" }).select("id").single();
    expect(code(await rpc(outsider, "report_community", { p_community: hidden.data.id, p_category: "spam" }))).toContain("not_found");
    expect(code(await rpc(member, "report_community", { p_community: community.id, p_category: "made-up" }))).toContain("invalid_category");
  });
});
