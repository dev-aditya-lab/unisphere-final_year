import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, cleanupUsers, createUser, grantRoleDirect } from "../helpers/supabase.js";

/**
 * Migration 20260140000048: a deleted post takes its comments, likes, bookmarks and the rest with it (by the author, and by
 * a global administrator through the console's multi-step flow), and only a global administrator can delete content or
 * ask to erase a member. Real sessions throughout; the service role only seeds and reads back.
 */

let gadmin, cadmin, author, fan, stranger;
const tag = Math.random().toString(36).slice(2, 7);
const slug = (p) => `${p}-${tag}-${Math.random().toString(36).slice(2, 7)}`;
const count = async (table, col, val) => (await admin.from(table).select("*", { count: "exact", head: true }).eq(col, val)).count;

async function seedPost(owner, extra = {}) {
  const { data, error } = await admin.from("posts").insert({ author_id: owner.id, slug: slug("pd"), body: "A post to delete", visibility: "public", ...extra }).select("id, slug").single();
  if (error) throw error;
  return data;
}

/** A repost made the way the app makes it: as the reposting member, so the original has to be visible to them. */
async function seedRepost(owner, originalId, body) {
  const { data, error } = await owner.client.from("posts").insert({ author_id: owner.id, slug: slug("rp"), repost_of_id: originalId, body, visibility: "public" }).select("id").single();
  if (error) throw error;
  return data;
}

/** A post with a comment, a reply, a like on the post and on the comment, a bookmark, a mention and a notification. */
async function seedBusyPost() {
  const post = await seedPost(author);
  const { data: c } = await admin.from("comments").insert({ post_id: post.id, author_id: fan.id, body: "first!" }).select("id").single();
  await admin.from("comments").insert({ post_id: post.id, author_id: author.id, parent_id: c.id, body: "thanks" });
  await admin.from("post_reactions").insert({ post_id: post.id, user_id: fan.id, reaction: "like" });
  await admin.from("comment_reactions").insert({ comment_id: c.id, user_id: author.id });
  await admin.from("bookmarks").insert({ user_id: fan.id, post_id: post.id });
  await admin.from("mentions").insert({ entity_type: "post", entity_id: post.id, mentioned_user_id: fan.id });
  await admin.from("mentions").insert({ entity_type: "comment", entity_id: c.id, mentioned_user_id: author.id });
  await admin.from("notifications").insert({ user_id: author.id, type: "comment", category: "social", entity_type: "post", entity_id: post.id, data: {} });
  return { ...post, commentId: c.id };
}

beforeAll(async () => {
  gadmin = await createUser("pd-gadmin");
  cadmin = await createUser("pd-cadmin");
  author = await createUser("pd-author");
  fan = await createUser("pd-fan");
  stranger = await createUser("pd-stranger");
  await grantRoleDirect(gadmin.id, "global_admin");
  await grantRoleDirect(cadmin.id, "college_admin", "00000000-0000-4000-8000-000000000001");
});
afterAll(async () => {
  await admin.from("posts").delete().like("slug", `%-${tag}-%`);
  await admin.from("communities").delete().like("slug", `%-${tag}-%`);
  await admin.from("events").delete().like("slug", `%-${tag}-%`);
  await cleanupUsers();
});

describe("a member deleting their own post", () => {
  it("removes the post with its comments, replies, likes, bookmarks, mentions and notifications", async () => {
    const post = await seedBusyPost();
    expect(await count("comments", "post_id", post.id)).toBe(2);

    const res = await author.client.rpc("delete_own_post", { p_post: post.id });
    expect(res.error).toBeNull();
    expect(res.data.counts).toMatchObject({ posts: 1, comments: 2, reactions: 1, comment_likes: 1, bookmarks: 1 });

    expect(await count("posts", "id", post.id)).toBe(0);
    expect(await count("comments", "post_id", post.id)).toBe(0);
    expect(await count("comment_reactions", "comment_id", post.commentId)).toBe(0);
    expect(await count("post_reactions", "post_id", post.id)).toBe(0);
    expect(await count("bookmarks", "post_id", post.id)).toBe(0);
    expect(await count("mentions", "entity_id", post.id)).toBe(0);
    expect(await count("mentions", "entity_id", post.commentId)).toBe(0);
    expect(await count("notifications", "entity_id", post.id)).toBe(0);
  });

  it("is refused for someone else's post, and leaves it alone", async () => {
    const post = await seedPost(author);
    const res = await stranger.client.rpc("delete_own_post", { p_post: post.id });
    expect(res.error?.message).toMatch(/not_found/);
    expect(await count("posts", "id", post.id)).toBe(1);
  });

  it("is refused for a post a moderator removed (it is part of a moderation record)", async () => {
    const post = await seedPost(author);
    await admin.from("posts").update({ status: "removed" }).eq("id", post.id);
    const res = await author.client.rpc("delete_own_post", { p_post: post.id });
    expect(res.error?.message).toMatch(/invalid_state/);
    expect(await count("posts", "id", post.id)).toBe(1);
  });

  it("takes plain reposts of the post with it, but keeps a quote repost as an ordinary post", async () => {
    const original = await seedPost(author);
    const plain = await seedRepost(fan, original.id, "");
    const quote = await seedRepost(stranger, original.id, "worth reading");

    const res = await author.client.rpc("delete_own_post", { p_post: original.id });
    expect(res.error).toBeNull();
    expect(res.data.counts.posts).toBe(2);
    expect(await count("posts", "id", plain.id)).toBe(0);
    const { data: kept } = await admin.from("posts").select("repost_of_id, body").eq("id", quote.id).single();
    expect(kept).toEqual({ repost_of_id: null, body: "worth reading" });
  });

  it("lets the author's whole account be erased even when other members plainly reposted their posts", async () => {
    const victim = await createUser("pd-victim");
    const original = await seedPost(victim);
    const plain = await seedRepost(fan, original.id, "");
    expect((await admin.rpc("erase_user_data", { p_user: victim.id, p_erase_messages: false })).error).toBeNull();
    const { error } = await admin.auth.admin.deleteUser(victim.id);
    expect(error).toBeNull();
    expect(await count("posts", "id", original.id)).toBe(0);
    expect(await count("posts", "id", plain.id)).toBe(0);
  });

  it("deletes posts that were only hidden before this change, in the migration's clean-up routine", async () => {
    const hidden = await seedBusyPost();
    await admin.from("posts").update({ status: "deleted" }).eq("id", hidden.id);
    const { error } = await admin.rpc("_purge_posts", { p_ids: [hidden.id] });
    expect(error).toBeNull();
    expect(await count("comments", "post_id", hidden.id)).toBe(0);
    expect(await count("posts", "id", hidden.id)).toBe(0);
  });
});

describe("an administrator deleting content for good", () => {
  it("is only for global administrators: a college admin and a member are refused", async () => {
    const post = await seedPost(author);
    for (const who of [cadmin, stranger]) {
      const impact = await who.client.rpc("admin_content_impact", { p_kind: "post", p_id: post.id });
      expect(impact.error?.message).toMatch(/forbidden/);
      const res = await who.client.rpc("admin_purge_content", { p_kind: "post", p_id: post.id, p_reason: "Long enough reason", p_confirm: post.slug });
      expect(res.error?.message).toMatch(/forbidden/);
    }
    expect(await count("posts", "id", post.id)).toBe(1);
  });

  it("shows what a deletion takes with it before anything is deleted", async () => {
    const post = await seedBusyPost();
    const { data, error } = await gadmin.client.rpc("admin_content_impact", { p_kind: "post", p_id: post.id });
    expect(error).toBeNull();
    expect(data).toMatchObject({ kind: "post", confirm: post.slug, owner: author.username });
    expect(data.counts).toMatchObject({ comments: 2, reactions: 1, comment_likes: 1, bookmarks: 1 });
    expect(await count("posts", "id", post.id)).toBe(1);
  });

  it("needs a real reason and the item's address typed exactly; a miss deletes nothing", async () => {
    const post = await seedPost(author);
    const short = await gadmin.client.rpc("admin_purge_content", { p_kind: "post", p_id: post.id, p_reason: "spam", p_confirm: post.slug });
    expect(short.error?.message).toMatch(/reason_required/);
    const wrong = await gadmin.client.rpc("admin_purge_content", { p_kind: "post", p_id: post.id, p_reason: "Repeated spam after warnings", p_confirm: "something-else" });
    expect(wrong.error?.message).toMatch(/confirmation_mismatch/);
    expect(await count("posts", "id", post.id)).toBe(1);
  });

  it("deletes a post with everything attached, records it in the audit log, tells the author and resolves open reports", async () => {
    const post = await seedBusyPost();
    await admin.from("reports").insert({ reporter_id: fan.id, target_type: "post", target_id: post.id, target_owner_id: author.id, category: "spam", status: "open" });

    const { data, error } = await gadmin.client.rpc("admin_purge_content", { p_kind: "post", p_id: post.id, p_reason: "Repeated spam after warnings", p_confirm: post.slug });
    expect(error).toBeNull();
    expect(data.counts).toMatchObject({ posts: 1, comments: 2, reactions: 1, bookmarks: 1 });
    expect(await count("posts", "id", post.id)).toBe(0);
    expect(await count("comments", "post_id", post.id)).toBe(0);
    expect(await count("post_reactions", "post_id", post.id)).toBe(0);

    const { data: audit } = await admin.from("audit_logs").select("actor_id, metadata").eq("action", "content.purged").eq("target_id", post.id);
    expect(audit).toHaveLength(1);
    expect(audit[0].actor_id).toBe(gadmin.id);
    expect(audit[0].metadata.reason).toBe("Repeated spam after warnings");

    const { data: report } = await admin.from("reports").select("status").eq("target_id", post.id).single();
    expect(report.status).toBe("resolved");
    const { data: notes } = await admin.from("notifications").select("type, data").eq("user_id", author.id).eq("type", "moderation_content_removed");
    expect(notes.some((n) => n.data.reason === "Repeated spam after warnings")).toBe(true);
  });

  it("deletes a community with its posts and its community-only events, and an event with its responses", async () => {
    const cslug = slug("cm");
    const { data: community } = await admin.from("communities").insert({ slug: cslug, name: "Chess club", created_by: author.id, college_id: "00000000-0000-4000-8000-000000000001" }).select("id").single();
    const post = await seedPost(author, { community_id: community.id, visibility: "community" });
    await admin.from("comments").insert({ post_id: post.id, author_id: fan.id, body: "nice" });

    const impact = await gadmin.client.rpc("admin_content_impact", { p_kind: "community", p_id: community.id });
    expect(impact.data.counts).toMatchObject({ posts: 1, comments: 1 });
    const res = await gadmin.client.rpc("admin_purge_content", { p_kind: "community", p_id: community.id, p_reason: "Violates the guidelines", p_confirm: cslug });
    expect(res.error).toBeNull();
    expect(await count("communities", "id", community.id)).toBe(0);
    expect(await count("posts", "id", post.id)).toBe(0);
    expect(await count("comments", "post_id", post.id)).toBe(0);

    const eslug = slug("ev");
    const { data: event } = await admin.from("events").insert({
      slug: eslug, title: "Meetup", organizer_id: author.id, college_id: "00000000-0000-4000-8000-000000000001", visibility: "college",
      starts_at: new Date(Date.now() + 86400000).toISOString(), ends_at: new Date(Date.now() + 90000000).toISOString(),
    }).select("id").single();
    await admin.from("event_registrations").insert({ event_id: event.id, user_id: fan.id, status: "going" });
    const gone = await gadmin.client.rpc("admin_purge_content", { p_kind: "event", p_id: event.id, p_reason: "Fake event, reported twice", p_confirm: eslug });
    expect(gone.error).toBeNull();
    expect(await count("events", "id", event.id)).toBe(0);
    expect(await count("event_registrations", "event_id", event.id)).toBe(0);
  });
});

describe("erasing a member", () => {
  it("is only for global administrators, never for yourself, and never for staff", async () => {
    const asCollegeAdmin = await cadmin.client.rpc("admin_prepare_user_purge", { p_user: stranger.id, p_confirm: stranger.username, p_reason: "Long enough reason" });
    expect(asCollegeAdmin.error?.message).toMatch(/forbidden/);
    const self = await gadmin.client.rpc("admin_prepare_user_purge", { p_user: gadmin.id, p_confirm: gadmin.username, p_reason: "Long enough reason" });
    expect(self.error?.message).toMatch(/cannot_act_on_self/);
    const staff = await gadmin.client.rpc("admin_prepare_user_purge", { p_user: cadmin.id, p_confirm: cadmin.username, p_reason: "Long enough reason" });
    expect(staff.error?.message).toMatch(/protected_account/);
  });

  it("needs the exact username and a reason, then writes the audit entry", async () => {
    const wrong = await gadmin.client.rpc("admin_prepare_user_purge", { p_user: stranger.id, p_confirm: "nope", p_reason: "Long enough reason" });
    expect(wrong.error?.message).toMatch(/confirmation_mismatch/);
    const ok = await gadmin.client.rpc("admin_prepare_user_purge", { p_user: stranger.id, p_confirm: stranger.username, p_reason: "Fraudulent account" });
    expect(ok.error).toBeNull();
    expect(ok.data.username).toBe(stranger.username);
    const { data: audit } = await admin.from("audit_logs").select("id").eq("action", "user.purge_started").eq("target_id", stranger.id);
    expect(audit).toHaveLength(1);
  });

  it("reports what the erasure will take", async () => {
    await seedBusyPost();
    const { data, error } = await gadmin.client.rpc("admin_user_impact", { p_user: author.id });
    expect(error).toBeNull();
    expect(data.counts.posts).toBeGreaterThanOrEqual(1);
    expect(data.protected).toBe(false);
  });
});
