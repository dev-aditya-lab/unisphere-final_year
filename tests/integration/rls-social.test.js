import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GREENFIELD, RIVERSIDE, admin, anon, cleanupUsers, createUser, grantRoleDirect } from "../helpers/supabase.js";

/**
 * Posts, comments, reactions, bookmarks, connections, blocking and reports,
 * checked with real sessions for several users. Each "cannot" is a refused attack.
 */

let alice, bob, carol, dave, mod;
const slug = (p) => `${p}-${Math.random().toString(36).slice(2, 8)}`;

async function makePost(user, patch = {}) {
  const { data, error } = await user.client
    .from("posts")
    .insert({ author_id: user.id, slug: slug("t"), body: "Hello campus", visibility: "college", ...patch })
    .select("id, slug, visibility")
    .single();
  if (error) throw error;
  return data;
}

const visibleTo = async (client, postId) => (await client.from("post_feed").select("id").eq("id", postId)).data?.length === 1;
const rawVisibleTo = async (client, postId) => (await client.from("posts").select("id").eq("id", postId)).data?.length === 1;

beforeAll(async () => {
  alice = await createUser("alice-s"); // Greenfield
  bob = await createUser("bob-s"); // Greenfield
  carol = await createUser("carol-s", { collegeId: RIVERSIDE }); // other college
  dave = await createUser("dave-s"); // Greenfield
  mod = await createUser("mod-s");
  await grantRoleDirect(mod.id, "moderator", GREENFIELD);
});

afterAll(async () => {
  await cleanupUsers();
});

describe("post visibility", () => {
  it("applies public / college / connections / private rules for every kind of viewer", async () => {
    const pub = await makePost(alice, { visibility: "public" });
    const college = await makePost(alice, { visibility: "college" });
    const conns = await makePost(alice, { visibility: "connections" });
    const priv = await makePost(alice, { visibility: "private" });

    // author sees everything of their own
    for (const p of [pub, college, conns, priv]) expect(await visibleTo(alice.client, p.id)).toBe(true);
    // logged-out: public only
    expect(await visibleTo(anon(), pub.id)).toBe(true);
    for (const p of [college, conns, priv]) expect(await visibleTo(anon(), p.id)).toBe(false);
    // same college: public + college
    expect(await visibleTo(bob.client, pub.id)).toBe(true);
    expect(await visibleTo(bob.client, college.id)).toBe(true);
    expect(await visibleTo(bob.client, conns.id)).toBe(false);
    expect(await visibleTo(bob.client, priv.id)).toBe(false);
    // other college: public only
    expect(await visibleTo(carol.client, pub.id)).toBe(true);
    expect(await visibleTo(carol.client, college.id)).toBe(false);

    // after connecting, connections-only becomes visible (even across colleges)
    const req = await bob.client.rpc("send_connection_request", { p_recipient: alice.id });
    expect(req.error).toBeNull();
    const pending = await alice.client.from("connection_requests").select("id").eq("requester_id", bob.id).eq("status", "pending").single();
    expect((await alice.client.rpc("respond_connection_request", { p_id: pending.data.id, p_accept: true })).error).toBeNull();
    expect(await visibleTo(bob.client, conns.id)).toBe(true);
    expect(await visibleTo(dave.client, conns.id)).toBe(false);
  });

  it("applies the same rules to the raw table, not only the view", async () => {
    const priv = await makePost(alice, { visibility: "private" });
    expect(await rawVisibleTo(bob.client, priv.id)).toBe(false);
    expect(await rawVisibleTo(anon(), priv.id)).toBe(false);
  });

  it("hides posts from people the author has blocked (and vice versa)", async () => {
    const p = await makePost(dave, { visibility: "public" });
    expect(await visibleTo(carol.client, p.id)).toBe(true);
    expect((await dave.client.rpc("block_user", { p_target: carol.id })).error).toBeNull();
    expect(await visibleTo(carol.client, p.id)).toBe(false);
    expect((await carol.client.rpc("send_connection_request", { p_recipient: dave.id })).error?.message).toContain("target_unavailable");
    await dave.client.rpc("unblock_user", { p_target: carol.id });
    expect(await visibleTo(carol.client, p.id)).toBe(true);
  });

  it("never exposes deleted posts, but moderators can see removed ones", async () => {
    const p = await makePost(alice, { visibility: "public" });
    expect((await alice.client.from("posts").update({ status: "deleted" }).eq("id", p.id)).error).toBeNull();
    expect(await visibleTo(anon(), p.id)).toBe(false);
    expect(await visibleTo(alice.client, p.id)).toBe(false);
    expect(await visibleTo(mod.client, p.id)).toBe(false);

    const q = await makePost(alice, { visibility: "college" });
    await admin.from("posts").update({ status: "removed", removed_reason: "spam" }).eq("id", q.id);
    expect(await visibleTo(bob.client, q.id)).toBe(false);
    expect(await visibleTo(mod.client, q.id)).toBe(true); // Greenfield moderator
    expect(await visibleTo(carol.client, q.id)).toBe(false);
  });

  it("keeps private posts out of search results", async () => {
    const word = `zebrafinch${Math.random().toString(36).slice(2, 8)}`;
    await makePost(alice, { visibility: "private", body: `secret ${word} thoughts` });
    await makePost(alice, { visibility: "public", body: `public ${word} thoughts` });
    const { data } = await bob.client.rpc("search_posts", { p_query: word, p_limit: 10 });
    expect(data).toHaveLength(1);
    expect(data[0].visibility).toBe("public");
  });
});

describe("post authorization and integrity", () => {
  it("lets users create only their own posts and cannot forge the author", async () => {
    const forged = await bob.client.from("posts").insert({ author_id: alice.id, slug: slug("f"), body: "as alice" });
    expect(forged.error).not.toBeNull();
  });

  it("stops users editing or deleting someone else's post", async () => {
    const p = await makePost(alice, { visibility: "public" });
    const edit = await bob.client.from("posts").update({ body: "hacked" }).eq("id", p.id).select();
    expect(edit.data ?? []).toHaveLength(0);
    const del = await bob.client.from("posts").update({ status: "deleted" }).eq("id", p.id).select();
    expect(del.data ?? []).toHaveLength(0);
    expect((await admin.from("posts").select("body, status").eq("id", p.id).single()).data).toMatchObject({ body: "Hello campus", status: "published" });
  });

  it("protects slug, author, counters and moderation fields from edits", async () => {
    const p = await makePost(alice);
    for (const patch of [{ slug: "new-slug" }, { author_id: bob.id }, { reaction_count: 99 }, { removed_reason: "x" }, { college_id: RIVERSIDE }]) {
      const res = await alice.client.from("posts").update(patch).eq("id", p.id);
      expect(res.error, JSON.stringify(patch)).not.toBeNull();
    }
  });

  it("marks edits and does not let a removed post be resurrected by its author", async () => {
    const p = await makePost(alice);
    await alice.client.from("posts").update({ body: "Edited body" }).eq("id", p.id);
    expect((await admin.from("posts").select("edited_at").eq("id", p.id).single()).data.edited_at).not.toBeNull();
    await admin.from("posts").update({ status: "removed" }).eq("id", p.id);
    const res = await alice.client.from("posts").update({ status: "published" }).eq("id", p.id).select();
    expect(res.data ?? []).toHaveLength(0);
  });

  it("rejects empty bodies and enforces the 4-image attachment limit", async () => {
    expect((await alice.client.from("posts").insert({ author_id: alice.id, slug: slug("e"), body: "" })).error).not.toBeNull();
    const p = await makePost(alice);
    const files = [];
    for (let i = 0; i < 5; i++) {
      const { data } = await admin
        .from("files")
        .insert({ owner_id: alice.id, bucket: "private", storage_key: `post_attachment/${alice.id}/${crypto.randomUUID()}.png`, purpose: "post_attachment", mime_type: "image/png", size_bytes: 10, status: "ready" })
        .select("id")
        .single();
      files.push(data.id);
    }
    for (let i = 0; i < 4; i++) {
      expect((await alice.client.from("post_attachments").insert({ post_id: p.id, file_id: files[i], position: i })).error).toBeNull();
    }
    expect((await alice.client.from("post_attachments").insert({ post_id: p.id, file_id: files[4], position: 4 })).error).not.toBeNull();
    // someone else's file cannot be attached
    const q = await makePost(bob);
    expect((await bob.client.from("post_attachments").insert({ post_id: q.id, file_id: files[0] })).error).not.toBeNull();
  });

  it("serves attachments only to people who can see the post", async () => {
    const p = await makePost(alice, { visibility: "college" });
    const { data: f } = await admin
      .from("files")
      .insert({ owner_id: alice.id, bucket: "private", storage_key: `post_attachment/${alice.id}/${crypto.randomUUID()}.png`, purpose: "post_attachment", mime_type: "image/png", size_bytes: 10, status: "ready" })
      .select("id")
      .single();
    await alice.client.from("post_attachments").insert({ post_id: p.id, file_id: f.id });
    expect((await bob.client.from("files").select("id").eq("id", f.id)).data).toHaveLength(1);
    expect((await carol.client.from("files").select("id").eq("id", f.id)).data).toHaveLength(0);
    expect((await anon().from("files").select("id").eq("id", f.id)).data).toHaveLength(0);
  });
});

describe("reposts", () => {
  it("credits the original, collapses repost chains and refuses private originals", async () => {
    const original = await makePost(alice, { visibility: "public", body: "original thought" });
    const r1 = await bob.client.from("posts").insert({ author_id: bob.id, slug: slug("r"), repost_of_id: original.id, body: "", visibility: "public" }).select("id, repost_of_id").single();
    expect(r1.error).toBeNull();
    expect((await admin.from("posts").select("repost_count").eq("id", original.id).single()).data.repost_count).toBe(1);

    // reposting a repost attributes the original
    const r2 = await dave.client.from("posts").insert({ author_id: dave.id, slug: slug("r"), repost_of_id: r1.data.id, body: "quote", visibility: "public" }).select("repost_of_id").single();
    expect(r2.data.repost_of_id).toBe(original.id);

    // a second plain repost by the same user is rejected
    const dup = await bob.client.from("posts").insert({ author_id: bob.id, slug: slug("r"), repost_of_id: original.id, body: "" });
    expect(dup.error?.code).toBe("23505");

    const priv = await makePost(alice, { visibility: "connections" });
    const bad = await dave.client.from("posts").insert({ author_id: dave.id, slug: slug("r"), repost_of_id: priv.id, body: "x" });
    expect(bad.error).not.toBeNull();
  });

  it("never makes a repost more visible than the original", async () => {
    const original = await makePost(alice, { visibility: "college", body: "college only" });
    const { data } = await bob.client.from("posts").insert({ author_id: bob.id, slug: slug("r"), repost_of_id: original.id, body: "look", visibility: "public" }).select("visibility").single();
    expect(data.visibility).toBe("college");
  });
});

describe("reactions, comments and bookmarks", () => {
  it("allows one reaction per user and keeps counts accurate", async () => {
    const p = await makePost(alice, { visibility: "public" });
    expect((await bob.client.from("post_reactions").insert({ post_id: p.id, user_id: bob.id, reaction: "like" })).error).toBeNull();
    const dup = await bob.client.from("post_reactions").insert({ post_id: p.id, user_id: bob.id, reaction: "like" });
    expect(dup.error?.code).toBe("23505");
    expect((await bob.client.from("post_reactions").update({ reaction: "celebrate" }).eq("post_id", p.id).eq("user_id", bob.id)).error).toBeNull();
    await dave.client.from("post_reactions").insert({ post_id: p.id, user_id: dave.id, reaction: "like" });
    const { data } = await admin.from("posts").select("reaction_count, reactions").eq("id", p.id).single();
    expect(data.reaction_count).toBe(2);
    expect(data.reactions).toEqual({ celebrate: 1, like: 1 });
    await bob.client.from("post_reactions").delete().eq("post_id", p.id).eq("user_id", bob.id);
    expect((await admin.from("posts").select("reaction_count").eq("id", p.id).single()).data.reaction_count).toBe(1);
  });

  it("refuses reactions as someone else, on invisible posts, and hides other people's reactions", async () => {
    const priv = await makePost(alice, { visibility: "private" });
    expect((await bob.client.from("post_reactions").insert({ post_id: priv.id, user_id: bob.id })).error).not.toBeNull();
    const p = await makePost(alice, { visibility: "public" });
    expect((await bob.client.from("post_reactions").insert({ post_id: p.id, user_id: alice.id })).error).not.toBeNull();
    await dave.client.from("post_reactions").insert({ post_id: p.id, user_id: dave.id });
    expect((await bob.client.from("post_reactions").select("user_id").eq("post_id", p.id)).data).toHaveLength(0);
  });

  it("supports threaded comments with a depth limit, ownership and counters", async () => {
    const p = await makePost(alice, { visibility: "public" });
    const c1 = (await bob.client.from("comments").insert({ post_id: p.id, author_id: bob.id, body: "First!" }).select("id").single()).data;
    const r1 = (await dave.client.from("comments").insert({ post_id: p.id, author_id: dave.id, parent_id: c1.id, body: "Reply" }).select("id").single()).data;
    expect((await dave.client.from("comments").insert({ post_id: p.id, author_id: dave.id, parent_id: r1.id, body: "Too deep" })).error?.message).toContain("reply_depth_exceeded");

    expect((await admin.from("posts").select("comment_count").eq("id", p.id).single()).data.comment_count).toBe(2);
    expect((await admin.from("comments").select("reply_count").eq("id", c1.id).single()).data.reply_count).toBe(1);

    // ownership
    expect((await dave.client.from("comments").update({ body: "tampered" }).eq("id", c1.id).select()).data ?? []).toHaveLength(0);
    expect((await bob.client.from("comments").update({ body: "edited" }).eq("id", c1.id)).error).toBeNull();
    // deleting a comment that has replies keeps the thread but blanks the text
    expect((await bob.client.from("comments").update({ status: "deleted" }).eq("id", c1.id)).error).toBeNull();
    const view = await anon().from("comment_feed").select("id, body, status").eq("post_id", p.id);
    const gone = view.data.find((c) => c.id === c1.id);
    expect(gone).toMatchObject({ status: "deleted", body: "" });
    expect((await admin.from("posts").select("comment_count").eq("id", p.id).single()).data.comment_count).toBe(1);
  });

  it("blocks commenting on invisible posts and by blocked users", async () => {
    const priv = await makePost(alice, { visibility: "private" });
    expect((await bob.client.from("comments").insert({ post_id: priv.id, author_id: bob.id, body: "hi" })).error).not.toBeNull();
    const pub = await makePost(alice, { visibility: "public" });
    await alice.client.rpc("block_user", { p_target: carol.id });
    expect((await carol.client.from("comments").insert({ post_id: pub.id, author_id: carol.id, body: "hi" })).error).not.toBeNull();
    await alice.client.rpc("unblock_user", { p_target: carol.id });
  });

  it("keeps bookmarks private to their owner", async () => {
    const p = await makePost(alice, { visibility: "public" });
    expect((await bob.client.from("bookmarks").insert({ user_id: bob.id, post_id: p.id })).error).toBeNull();
    expect((await bob.client.from("bookmarks").insert({ user_id: bob.id, post_id: p.id })).error?.code).toBe("23505");
    expect((await alice.client.from("bookmarks").select("post_id")).data).toHaveLength(0);
    expect((await bob.client.from("post_feed").select("bookmarked").eq("id", p.id).single()).data.bookmarked).toBe(true);
    expect((await alice.client.from("post_feed").select("bookmarked").eq("id", p.id).single()).data.bookmarked).toBe(false);
  });

  it("fails closed for suspended or restricted accounts and when verification is required", async () => {
    const temp = await createUser("restricted-s");
    await admin.from("profiles").update({ status: "restricted" }).eq("id", temp.id);
    expect((await temp.client.from("posts").insert({ author_id: temp.id, slug: slug("x"), body: "hi" })).error).not.toBeNull();

    const other = await createUser("unverified-s");
    await admin.from("system_settings").update({ value: true }).eq("key", "college_verification_required");
    try {
      expect((await other.client.from("posts").insert({ author_id: other.id, slug: slug("x"), body: "hi" })).error).not.toBeNull();
      await admin.from("profiles").update({ verification_status: "verified" }).eq("id", other.id);
      expect((await other.client.from("posts").insert({ author_id: other.id, slug: slug("x"), body: "hi" })).error).toBeNull();
    } finally {
      await admin.from("system_settings").update({ value: false }).eq("key", "college_verification_required");
    }
  });
});

describe("connections", () => {
  it("auto-accepts a mirrored request, prevents duplicates and keeps counts in sync", async () => {
    const a = await createUser("conn-a");
    const b = await createUser("conn-b");
    expect((await a.client.rpc("send_connection_request", { p_recipient: b.id, p_message: "hi" })).data.status).toBe("pending");
    expect((await a.client.rpc("send_connection_request", { p_recipient: b.id })).error?.message).toContain("already_requested");
    // b asking a back accepts a's request
    expect((await b.client.rpc("send_connection_request", { p_recipient: a.id })).data.status).toBe("connected");
    expect((await a.client.rpc("send_connection_request", { p_recipient: b.id })).error?.message).toContain("already_connected");
    const counts = await admin.from("profiles").select("id, connection_count, follower_count, following_count").in("id", [a.id, b.id]);
    for (const row of counts.data) expect(row).toMatchObject({ connection_count: 1, follower_count: 1, following_count: 1 });
    expect((await a.client.rpc("remove_connection", { p_other: b.id })).error).toBeNull();
    expect((await admin.from("profiles").select("connection_count").eq("id", a.id).single()).data.connection_count).toBe(0);
  });

  it("only lets the recipient answer, refuses self-requests and cleans up on block", async () => {
    const a = await createUser("conn-c");
    const b = await createUser("conn-d");
    const c = await createUser("conn-e");
    expect((await a.client.rpc("send_connection_request", { p_recipient: a.id })).error).not.toBeNull();
    await a.client.rpc("send_connection_request", { p_recipient: b.id });
    const req = (await b.client.from("connection_requests").select("id").eq("requester_id", a.id).single()).data;
    expect((await c.client.rpc("respond_connection_request", { p_id: req.id, p_accept: true })).error).not.toBeNull();
    expect((await a.client.rpc("respond_connection_request", { p_id: req.id, p_accept: true })).error).not.toBeNull();
    expect((await b.client.rpc("block_user", { p_target: a.id })).error).toBeNull();
    expect((await admin.from("connection_requests").select("status").eq("id", req.id).single()).data.status).toBe("cancelled");
    // users cannot write the graph tables directly
    expect((await a.client.from("connections").insert({ user_a: a.id, user_b: c.id })).error).not.toBeNull();
    expect((await a.client.from("user_blocks").insert({ blocker_id: a.id, blocked_id: c.id })).error).not.toBeNull();
  });
});

describe("reports", () => {
  it("snapshots reported content, deduplicates and keeps reports confidential", async () => {
    const p = await makePost(alice, { visibility: "public", body: "reportable content" });
    const res = await bob.client.rpc("submit_report", { p_target_type: "post", p_target_id: p.id, p_category: "spam", p_details: "looks like spam" });
    expect(res.error).toBeNull();
    const { data: row } = await admin.from("reports").select("*").eq("id", res.data).single();
    expect(row).toMatchObject({ target_owner_id: alice.id, college_id: GREENFIELD, status: "open", severity: "low" });
    expect(row.snapshot.body).toBe("reportable content");

    expect((await bob.client.rpc("submit_report", { p_target_type: "post", p_target_id: p.id, p_category: "spam" })).error?.message).toContain("already_reported");
    expect((await alice.client.rpc("submit_report", { p_target_type: "post", p_target_id: p.id, p_category: "spam" })).error?.message).toContain("cannot_report_self");

    // the reported author cannot see the report; the reporter only sees their own, without internal fields
    expect((await alice.client.from("reports").select("id")).data ?? []).toHaveLength(0);
    expect((await bob.client.from("reports").select("id, status")).data).toHaveLength(1);
    expect((await bob.client.from("reports").select("snapshot")).error).not.toBeNull();
  });

  it("cannot be used to probe posts the reporter is not allowed to see", async () => {
    const priv = await makePost(alice, { visibility: "private" });
    const res = await bob.client.rpc("submit_report", { p_target_type: "post", p_target_id: priv.id, p_category: "other" });
    expect(res.error?.message).toContain("target_unavailable");
  });

  it("gives self-harm and violence reports higher severity", async () => {
    const p = await makePost(alice, { visibility: "public" });
    const res = await dave.client.rpc("submit_report", { p_target_type: "post", p_target_id: p.id, p_category: "self_harm" });
    expect((await admin.from("reports").select("severity").eq("id", res.data).single()).data.severity).toBe("high");
  });
});

describe("people search and suggestions", () => {
  it("respects profile visibility and filters in people search", async () => {
    const hidden = await createUser("hidden-s", { visibility: "private" });
    const found = await createUser("findme-s");
    await admin.from("profiles").update({ skills: ["Rustlang"], open_to_collaboration: true }).eq("id", found.id);
    await admin.from("profiles").update({ skills: ["Rustlang"] }).eq("id", hidden.id);

    const res = await bob.client.rpc("search_people", { p_skills: ["rustlang"] });
    const ids = res.data.map((p) => p.id);
    expect(ids).toContain(found.id);
    expect(ids).not.toContain(hidden.id);
    const collab = await bob.client.rpc("search_people", { p_open_to_collab: true, p_skills: ["rustlang"] });
    expect(collab.data.map((p) => p.id)).toEqual([found.id]);
    // anonymous visitors only see public profiles
    expect((await anon().rpc("search_people", { p_skills: ["rustlang"] })).data).toHaveLength(0);
  });

  it("suggests same-college people ranked by shared skills, excluding connections", async () => {
    const me = await createUser("sugg-me");
    const match = await createUser("sugg-match");
    const other = await createUser("sugg-other", { collegeId: RIVERSIDE });
    await admin.from("profiles").update({ skills: ["Quantum"] }).in("id", [me.id, match.id, other.id]);
    const res = await me.client.rpc("suggested_people", { p_limit: 20 });
    const ids = res.data.map((p) => p.id);
    expect(ids[0]).toBe(match.id);
    expect(res.data[0].shared_skills).toEqual(["Quantum"]);
    expect(ids).not.toContain(other.id);
    expect(ids).not.toContain(me.id);
  });
});
