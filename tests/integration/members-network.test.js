import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GREENFIELD, RIVERSIDE, admin, anon, cleanupUsers, createUser } from "../helpers/supabase.js";

/**
 * UniSphere is open to everyone who signs up: no college, role or ID is needed to use it. Logged-out visitors
 * still see nothing, and a member's own privacy settings keep working.
 */
let alice, newcomer, outsider;
const tag = Math.random().toString(36).slice(2, 7);
const slug = (s) => `${s}-mn-${tag}`;

beforeAll(async () => {
  alice = await createUser("mn-alice"); // a student of Greenfield who stated both
  // Someone who joined without saying what they are or choosing a college.
  newcomer = await createUser("mn-newcomer", { accountType: null, collegeId: null });
  outsider = await createUser("mn-outsider", { collegeId: RIVERSIDE });
});
afterAll(async () => {
  await admin.from("posts").delete().like("slug", `%-mn-${tag}`);
  await cleanupUsers();
});

const post = (u, visibility, extra = {}) =>
  u.client.from("posts").insert({ author_id: u.id, slug: slug(`${visibility}-${Math.random().toString(36).slice(2, 8)}`), title: `Open network ${visibility} ${tag}`, body: "A post for the open-network tests.", visibility, ...extra }).select("id, visibility").single();

describe("joining without a role or a college", () => {
  it("creates a normal, active account with no role and no college", async () => {
    const { data } = await admin.from("profiles").select("account_type, college_id, status, verification_status").eq("id", newcomer.id).single();
    expect(data).toMatchObject({ account_type: null, college_id: null, status: "active", verification_status: "unverified" });
  });

  it("can use the network: read what members share with everyone and post to everyone", async () => {
    const pub = (await post(alice, "public")).data;
    expect(pub).toBeTruthy();
    expect((await newcomer.client.from("posts").select("id").eq("id", pub.id)).data).toHaveLength(1);
    expect((await newcomer.client.from("post_feed").select("id").eq("id", pub.id)).data).toHaveLength(1);
    expect((await newcomer.client.rpc("feed_posts", { p_scope: "public" })).error).toBeNull();

    const mine = await post(newcomer, "public");
    expect(mine.error).toBeNull();
    expect((await alice.client.from("posts").select("id").eq("id", mine.data.id)).data).toHaveLength(1);
  });

  it("can find people and be found, with no college filter", async () => {
    const found = await newcomer.client.rpc("search_people", { p_query: "mn-alice" });
    expect(found.error).toBeNull();
    expect((found.data ?? []).map((p) => p.id)).toContain(alice.id);
  });

  it("cannot share with 'my college' without one: the database says why instead of hiding the post", async () => {
    const res = await post(newcomer, "college");
    expect(res.error?.message).toContain("college_required");
    // and an account that does have a college still can
    expect((await post(alice, "college")).error).toBeNull();
  });

  it("is never treated as verified or as a student", async () => {
    const card = (await alice.client.from("post_feed").select("author_verified, author_account_type").like("slug", "%-mn-" + tag).limit(1)).data?.[0];
    expect(card?.author_verified).toBe(false);
    expect((await admin.from("profiles").select("verification_status").eq("id", newcomer.id).single()).data.verification_status).toBe("unverified");
  });
});

describe("what stays private", () => {
  it("logged-out visitors can read nothing, not even the college directory", async () => {
    for (const table of ["posts", "profiles", "projects", "communities", "events", "opportunities", "post_feed", "colleges", "college_aliases", "college_reports"]) {
      const res = await anon().from(table).select("*").limit(1);
      expect(res.data ?? [], table).toEqual([]);
    }
    for (const [fn, args] of [["search_colleges", { p_q: "greenfield" }], ["list_colleges_directory", {}], ["feed_posts", { p_scope: "public" }]]) {
      const res = await anon().rpc(fn, args);
      expect(res.error, fn).not.toBeNull();
    }
  });

  it("members still only see college-only content when they share the college", async () => {
    const p = (await post(alice, "college")).data;
    expect((await alice.client.from("posts").select("id").eq("id", p.id)).data).toHaveLength(1);
    expect((await newcomer.client.from("posts").select("id").eq("id", p.id)).data ?? []).toHaveLength(0);
    expect((await outsider.client.from("posts").select("id").eq("id", p.id)).data ?? []).toHaveLength(0);
  });

  it("a member's profile visibility is still honoured", async () => {
    await admin.from("profiles").update({ visibility: "private" }).eq("id", alice.id);
    expect((await newcomer.client.from("profiles").select("id").eq("id", alice.id)).data ?? []).toHaveLength(0);
    await admin.from("profiles").update({ visibility: "college" }).eq("id", alice.id);
  });

  it("suspended accounts are still locked out", async () => {
    const temp = await createUser("mn-suspended", { accountType: null, collegeId: null });
    await admin.from("profiles").update({ status: "suspended" }).eq("id", temp.id);
    expect((await temp.client.from("posts").insert({ author_id: temp.id, slug: slug("suspended"), body: "hi", visibility: "public" })).error).not.toBeNull();
  });
});

describe("the closed-network switch is gone", () => {
  it("has no verification requirement setting any more", async () => {
    const { data } = await admin.from("system_settings").select("key").eq("key", "college_verification_required");
    expect(data ?? []).toHaveLength(0);
  });
});

// A reference to keep the unused constant honest if fixtures change.
void GREENFIELD;
