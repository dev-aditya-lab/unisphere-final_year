import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, cleanupUsers, createUser, RIVERSIDE } from "../helpers/supabase.js";

/**
 * Migration 20260123000030: composer suggestions and the "For you" feed, with real sessions.
 * What matters: suggestions and candidates never reveal what the member may not see, and personal data stays personal.
 */

let a, b, c, outsider;
const tag = `t${Date.now().toString(36)}`;
let publicPost, collegePost, privatePost;

const insertPost = async (author, row) => {
  const { data, error } = await admin
    .from("posts")
    .insert({ author_id: author.id, slug: `${row.category ?? "general"}-${Math.random().toString(36).slice(2, 10)}`, body: "A post body that is long enough to be a real post.", college_id: author.collegeId ?? null, ...row })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
};
const link = async (postId, t) => {
  await admin.from("hashtags").upsert({ tag: t }, { onConflict: "tag", ignoreDuplicates: true });
  const { data } = await admin.from("hashtags").select("id").eq("tag", t).single();
  await admin.from("post_hashtags").insert({ post_id: postId, hashtag_id: data.id });
};

beforeAll(async () => {
  a = await createUser("disc-a");
  b = await createUser("disc-b");
  c = await createUser("disc-c");
  outsider = await createUser("disc-out", { collegeId: RIVERSIDE });
  for (const u of [a, b, c]) {
    const { data } = await admin.from("profiles").select("college_id").eq("id", u.id).single();
    u.collegeId = data.college_id;
  }
  publicPost = await insertPost(b, { category: "projects", visibility: "public", title: "Public robotics build" });
  collegePost = await insertPost(b, { category: "ideas", visibility: "college", title: "College only idea" });
  privatePost = await insertPost(b, { category: "general", visibility: "private", title: "My private note" });
  await link(publicPost, `pub${tag}`);
  await link(publicPost, `shared${tag}`);
  await link(privatePost, `secret${tag}`);
  await link(collegePost, `colleg${tag}`);
});
afterAll(async () => {
  await cleanupUsers();
});

describe("suggest_hashtags", () => {
  it("finds public tags by prefix, most used first", async () => {
    const { data, error } = await a.client.rpc("suggest_hashtags", { p_prefix: `pub${tag.slice(0, 3)}`, p_limit: 6 });
    expect(error).toBeNull();
    expect(data.map((r) => r.tag)).toContain(`pub${tag}`);
    expect(data.length).toBeLessThanOrEqual(6);
  });

  it("never reveals a tag that appears only in private or college-only posts", async () => {
    const secret = await a.client.rpc("suggest_hashtags", { p_prefix: `secret${tag.slice(0, 3)}`, p_limit: 10 });
    expect(secret.data.map((r) => r.tag)).not.toContain(`secret${tag}`);
    const college = await a.client.rpc("suggest_hashtags", { p_prefix: `colleg${tag.slice(0, 3)}`, p_limit: 10 });
    expect(college.data.map((r) => r.tag)).not.toContain(`colleg${tag}`);
  });

  it("treats underscore and other characters literally and normalises case", async () => {
    const upper = await a.client.rpc("suggest_hashtags", { p_prefix: `PUB${tag.slice(0, 3).toUpperCase()}`, p_limit: 6 });
    expect(upper.data.map((r) => r.tag)).toContain(`pub${tag}`);
    const wild = await a.client.rpc("suggest_hashtags", { p_prefix: "_%", p_limit: 6 });
    expect(wild.error).toBeNull();
    expect(wild.data).toEqual([]);
  });

  it("caps the result count whatever the caller asks for, and refuses anonymous callers", async () => {
    const many = await a.client.rpc("suggest_hashtags", { p_prefix: "", p_limit: 500 });
    expect(many.data.length).toBeLessThanOrEqual(10);
    const { anon } = await import("../helpers/supabase.js");
    const res = await anon().rpc("suggest_hashtags", { p_prefix: "", p_limit: 5 });
    expect(res.error).not.toBeNull();
  });
});

describe("mention_suggestions", () => {
  it("matches a username or a name word by prefix and never suggests yourself", async () => {
    const byName = await a.client.rpc("mention_suggestions", { p_query: "test disc", p_limit: 8 });
    expect(byName.error).toBeNull();
    expect(byName.data.map((p) => p.id)).toContain(b.id);
    expect(byName.data.map((p) => p.id)).not.toContain(a.id);
    const byUsername = await a.client.rpc("mention_suggestions", { p_query: b.username.slice(0, 6), p_limit: 8 });
    expect(byUsername.data.map((p) => p.id)).toContain(b.id);
  });

  it("lists people you follow first, and only them for an empty query", async () => {
    await a.client.from("follows").insert({ follower_id: a.id, following_id: c.id });
    const empty = await a.client.rpc("mention_suggestions", { p_query: "", p_limit: 8 });
    expect(empty.data.map((p) => p.id)).toEqual([c.id]);
    const both = await a.client.rpc("mention_suggestions", { p_query: "test disc", p_limit: 8 });
    expect(both.data[0].id).toBe(c.id);
    expect(both.data[0].followed).toBe(true);
    await a.client.from("follows").delete().eq("follower_id", a.id).eq("following_id", c.id);
  });

  it("does not suggest a person who blocked you, and bounds the count", async () => {
    await b.client.rpc("block_user", { p_target: a.id });
    const res = await a.client.rpc("mention_suggestions", { p_query: "test disc", p_limit: 100 });
    expect(res.data.map((p) => p.id)).not.toContain(b.id);
    expect(res.data.length).toBeLessThanOrEqual(8);
    await b.client.rpc("unblock_user", { p_target: a.id });
  });

  it("does not leak profile fields beyond the suggestion shape", async () => {
    const res = await a.client.rpc("mention_suggestions", { p_query: "test disc", p_limit: 3 });
    expect(Object.keys(res.data[0]).sort()).toEqual(["avatar_key", "followed", "full_name", "headline", "id", "username", "verified"]);
  });
});

describe("feed_candidates", () => {
  it("returns only what the member may see, never private posts, and bounds the page", async () => {
    const { data, error } = await a.client.rpc("feed_candidates", { p_limit: 500 });
    expect(error).toBeNull();
    expect(data.length).toBeLessThanOrEqual(150);
    const seen = data.map((p) => p.id);
    expect(seen).toContain(publicPost);
    expect(seen).not.toContain(privatePost);
  });

  it("hides college-only posts from a member of another college", async () => {
    const mine = await a.client.rpc("feed_candidates", { p_limit: 150 });
    const theirs = await outsider.client.rpc("feed_candidates", { p_limit: 150 });
    expect(mine.data.map((p) => p.id)).toContain(collegePost);
    expect(theirs.data.map((p) => p.id)).not.toContain(collegePost);
  });

  it("filters by category and pages newest-first with a cursor", async () => {
    const projects = await a.client.rpc("feed_candidates", { p_limit: 50, p_category: "projects" });
    expect(projects.data.every((p) => p.category === "projects")).toBe(true);
    const first = await a.client.rpc("feed_candidates", { p_limit: 3 });
    const last = first.data[2];
    const next = await a.client.rpc("feed_candidates", { p_limit: 3, p_before_ts: last.created_at, p_before_id: last.id });
    expect(next.data.map((p) => p.id).filter((id) => first.data.some((f) => f.id === id))).toEqual([]);
    expect(new Date(next.data[0].created_at) <= new Date(last.created_at)).toBe(true);
  });

  it("drops posts the member marked not relevant, only for them", async () => {
    const res = await a.client.from("post_feedback").insert({ user_id: a.id, post_id: publicPost });
    expect(res.error).toBeNull();
    const mine = await a.client.rpc("feed_candidates", { p_limit: 150 });
    const others = await c.client.rpc("feed_candidates", { p_limit: 150 });
    expect(mine.data.map((p) => p.id)).not.toContain(publicPost);
    expect(others.data.map((p) => p.id)).toContain(publicPost);
    await a.client.from("post_feedback").delete().eq("post_id", publicPost);
  });
});

describe("post_feedback and viewer_affinity are private to the member", () => {
  it("cannot be read, written or deleted by another member", async () => {
    await a.client.from("post_feedback").insert({ user_id: a.id, post_id: publicPost });
    const peek = await c.client.from("post_feedback").select("post_id").eq("user_id", a.id);
    expect(peek.data).toEqual([]);
    const forge = await c.client.from("post_feedback").insert({ user_id: a.id, post_id: collegePost });
    expect(forge.error).not.toBeNull();
    await c.client.from("post_feedback").delete().eq("user_id", a.id);
    const still = await admin.from("post_feedback").select("post_id").eq("user_id", a.id);
    expect(still.data).toHaveLength(1);
    await a.client.from("post_feedback").delete().eq("post_id", publicPost);
  });

  it("summarises only the caller's own reactions, bookmarks and comments", async () => {
    await a.client.from("post_reactions").insert({ post_id: publicPost, user_id: a.id, reaction: "like" });
    await a.client.from("bookmarks").insert({ user_id: a.id, post_id: publicPost });
    const mine = await a.client.rpc("viewer_affinity", { p_days: 60 });
    expect(mine.data.categories.projects).toBe(3); // a reaction (1) and a bookmark (2)
    expect(mine.data.authors[b.id]).toBe(3);
    expect(mine.data.tags[`pub${tag}`]).toBe(3);
    const theirs = await c.client.rpc("viewer_affinity", { p_days: 60 });
    expect(theirs.data.categories).toEqual({});
    const anonymous = await (await import("../helpers/supabase.js")).anon().rpc("viewer_affinity", { p_days: 60 });
    expect(anonymous.error).not.toBeNull();
  });
});

describe("posts_by_hashtag", () => {
  it("returns visible posts for the tag, newest first, and nothing for a tag the viewer cannot see posts of", async () => {
    const res = await a.client.rpc("posts_by_hashtag", { p_tag: `shared${tag}`, p_limit: 20 });
    expect(res.error).toBeNull();
    expect(res.data.map((p) => p.id)).toEqual([publicPost]);
    const privateTag = await c.client.rpc("posts_by_hashtag", { p_tag: `secret${tag}`, p_limit: 20 });
    expect(privateTag.data).toEqual([]);
    const upper = await a.client.rpc("posts_by_hashtag", { p_tag: `SHARED${tag}`.toUpperCase(), p_limit: 20 });
    expect(upper.data.map((p) => p.id)).toEqual([publicPost]);
  });
});
