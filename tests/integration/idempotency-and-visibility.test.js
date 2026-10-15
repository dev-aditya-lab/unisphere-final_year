import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GREENFIELD, RIVERSIDE, admin, cleanupUsers, createUser, grantRoleDirect } from "../helpers/supabase.js";

/**
 * Two guarantees added by the performance work:
 *  1. idempotency keys: a repeated write with the same key cannot create a second row;
 *  2. the flattened visibility helpers (migration 24) still answer exactly what the original definition
 *     (the retained `_can_view_*_base` function plus the "active member" gate) answers.
 */

let alice, bob, carol, mod;
const slug = (p) => `${p}-${Math.random().toString(36).slice(2, 8)}`;
const uuid = () => crypto.randomUUID();

beforeAll(async () => {
  alice = await createUser("idem-alice");
  bob = await createUser("idem-bob");
  carol = await createUser("idem-carol", { collegeId: RIVERSIDE });
  mod = await createUser("idem-mod");
  await grantRoleDirect(mod.id, "moderator", GREENFIELD);
});
afterAll(async () => {
  await cleanupUsers();
});

describe("idempotency keys", () => {
  it("refuse a second post with the same key, but allow it for another author and for no key", async () => {
    const key = uuid();
    const first = await alice.client.from("posts").insert({ author_id: alice.id, slug: slug("i"), body: "once", visibility: "college", client_op_id: key }).select("id").single();
    expect(first.error).toBeNull();

    const again = await alice.client.from("posts").insert({ author_id: alice.id, slug: slug("i"), body: "once", visibility: "college", client_op_id: key });
    expect(again.error?.code).toBe("23505");
    expect(again.error?.message).toContain("posts_client_op_idx");

    // another member may use the same value: the key is scoped to its author
    const other = await bob.client.from("posts").insert({ author_id: bob.id, slug: slug("i"), body: "bob", visibility: "college", client_op_id: key });
    expect(other.error).toBeNull();

    // writes without a key are never deduplicated
    for (let i = 0; i < 2; i++) {
      const r = await alice.client.from("posts").insert({ author_id: alice.id, slug: slug("n"), body: "no key", visibility: "college" });
      expect(r.error).toBeNull();
    }
  });

  it("applies to comments and messages as well", async () => {
    const { data: post } = await alice.client.from("posts").insert({ author_id: alice.id, slug: slug("c"), body: "post", visibility: "public" }).select("id").single();
    const key = uuid();
    const c1 = await bob.client.from("comments").insert({ post_id: post.id, author_id: bob.id, body: "hi", client_op_id: key });
    expect(c1.error).toBeNull();
    const c2 = await bob.client.from("comments").insert({ post_id: post.id, author_id: bob.id, body: "hi", client_op_id: key });
    expect(c2.error?.code).toBe("23505");

    await admin.from("profiles").update({ allow_messages_from: "everyone" }).eq("id", bob.id);
    const conv = await alice.client.rpc("start_direct_conversation", { p_other: bob.id });
    expect(conv.error).toBeNull();
    const mkey = uuid();
    const m1 = await alice.client.from("messages").insert({ conversation_id: conv.data, sender_id: alice.id, body: "hello", client_op_id: mkey });
    expect(m1.error).toBeNull();
    const m2 = await alice.client.from("messages").insert({ conversation_id: conv.data, sender_id: alice.id, body: "hello", client_op_id: mkey });
    expect(m2.error?.code).toBe("23505");
    const { count } = await admin.from("messages").select("id", { count: "exact", head: true }).eq("conversation_id", conv.data).eq("client_op_id", mkey);
    expect(count).toBe(1);
  });

  it("cannot be changed afterwards", async () => {
    const { data: p } = await alice.client.from("posts").insert({ author_id: alice.id, slug: slug("u"), body: "x", visibility: "college", client_op_id: uuid() }).select("id").single();
    const r = await alice.client.from("posts").update({ client_op_id: uuid() }).eq("id", p.id);
    expect(r.error).not.toBeNull();
  });
});

describe("flattened visibility helpers keep the original answers", () => {
  it("can_view_post equals base AND (author OR active member) for several viewers and post kinds", async () => {
    const kinds = ["public", "college", "connections", "private"];
    const posts = [];
    for (const visibility of kinds) {
      const { data } = await alice.client.from("posts").insert({ author_id: alice.id, slug: slug("v"), body: visibility, visibility }).select("id, author_id, college_id, visibility, community_id, status").single();
      posts.push(data);
    }
    await bob.client.rpc("send_connection_request", { p_recipient: alice.id }); // pending only: not connected

    for (const viewer of [alice, bob, carol, mod]) {
      const { data: active } = await viewer.client.rpc("can_use_network");
      for (const p of posts) {
        const args = { p_author: p.author_id, p_college: p.college_id, p_visibility: p.visibility, p_community: p.community_id, p_status: p.status };
        const flat = (await viewer.client.rpc("can_view_post", args)).data;
        const base = (await viewer.client.rpc("_can_view_post_base", args)).data;
        const expected = Boolean(base) && (p.author_id === viewer.id || Boolean(active));
        expect(Boolean(flat), `${p.visibility} post for ${viewer.username}`).toBe(expected);
      }
    }
  });

  it("can_view_profile equals base AND (self OR active member) across visibility settings", async () => {
    await admin.from("profiles").update({ visibility: "college" }).eq("id", alice.id);
    await admin.from("profiles").update({ visibility: "connections" }).eq("id", bob.id);
    const { data: rows } = await admin.from("profiles").select("id, visibility, college_id, status").in("id", [alice.id, bob.id, carol.id, mod.id]);
    for (const viewer of [alice, bob, carol]) {
      const { data: active } = await viewer.client.rpc("can_use_network");
      for (const p of rows) {
        const args = { p_id: p.id, p_visibility: p.visibility, p_college: p.college_id, p_status: p.status };
        const flat = (await viewer.client.rpc("can_view_profile", args)).data;
        const base = (await viewer.client.rpc("_can_view_profile_base", args)).data;
        expect(Boolean(flat), `${p.visibility} profile for ${viewer.username}`).toBe(Boolean(base) && (p.id === viewer.id || Boolean(active)));
      }
    }
  });
});
