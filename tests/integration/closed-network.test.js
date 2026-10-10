import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GREENFIELD, RIVERSIDE, admin, anon, cleanupUsers, createUser, grantRoleDirect, setSetting } from "../helpers/supabase.js";

/**
 * UniSphere is a closed network: logged-out visitors see nothing, and (in production, where verification is
 * required) neither do signed-in accounts that have not been verified as RGEC members.
 */
let verified, unverified, staff, outsider;
const tag = Math.random().toString(36).slice(2, 7);

beforeAll(async () => {
  verified = await createUser("cn-verified");
  unverified = await createUser("cn-unverified");
  staff = await createUser("cn-staff");
  outsider = await createUser("cn-outsider", { collegeId: RIVERSIDE });
  await admin.from("profiles").update({ verification_status: "verified", verified_at: new Date().toISOString() }).eq("id", verified.id);
  await grantRoleDirect(staff.id, "moderator", GREENFIELD);
  await setSetting("college_verification_required", true);
});
afterAll(async () => {
  await setSetting("college_verification_required", false);
  await admin.from("posts").delete().like("slug", `%-cn-${tag}`);
  await admin.from("feedback_items").delete().like("title", `%${tag}%`);
  await cleanupUsers();
});

const post = async (u, visibility) =>
  (await u.client.from("posts").insert({ author_id: u.id, slug: `${visibility}-cn-${tag}`, title: `Closed network ${visibility} ${tag}`, body: "A post for the closed-network tests.", visibility }).select("id").single());

describe("logged-out visitors", () => {
  it("can read nothing but the sign-up essentials", async () => {
    // content tables and views are not granted to the anonymous role at all
    for (const table of ["posts", "profiles", "projects", "communities", "events", "opportunities", "comments", "post_feed", "project_cards", "event_cards", "community_cards", "files", "hashtags", "releases"]) {
      const res = await anon().from(table).select("*").limit(1);
      expect(res.data ?? [], table).toEqual([]);
    }
    // what the sign-up form needs is still there
    expect((await anon().from("colleges").select("id").eq("id", GREENFIELD)).data).toHaveLength(1);
    expect((await anon().from("system_settings").select("key").eq("key", "platform_name")).data).toHaveLength(1);
    expect((await anon().rpc("username_available", { p_username: `free-${tag}` })).data).toBe(true);
  });

  it("cannot call privileged or member-only functions", async () => {
    const calls = [
      ["list_reports", {}], ["admin_overview", {}], ["feed_posts", { p_scope: "college" }], ["search_people", {}], ["suggested_people", {}],
      ["submit_feedback", { p_kind: "bug", p_title: "Hello there", p_body: "Anonymous bug report" }], ["public_roadmap", {}],
      ["start_direct_conversation", { p_other: verified.id }], ["trending_hashtags", {}],
    ];
    for (const [fn, args] of calls) {
      const res = await anon().rpc(fn, args);
      expect(res.error, fn).not.toBeNull();
      expect(String(res.error.code), fn).toMatch(/42501|PGRST202|28000/); // permission denied
    }
  });
});

describe("signed-in but not yet verified", () => {
  it("cannot see other members' content, even content marked public or college-wide", async () => {
    const pub = (await post(verified, "public")).data;
    const college = (await post(verified, "college")).data;
    for (const p of [pub, college]) {
      expect((await verified.client.from("posts").select("id").eq("id", p.id)).data).toHaveLength(1);
      expect((await unverified.client.from("posts").select("id").eq("id", p.id)).data ?? []).toHaveLength(0);
      expect((await unverified.client.from("post_feed").select("id").eq("id", p.id)).data ?? []).toHaveLength(0);
      expect((await staff.client.from("posts").select("id").eq("id", p.id)).data).toHaveLength(1); // staff are never locked out
    }
    expect((await unverified.client.rpc("feed_posts", { p_scope: "college" })).data ?? []).toHaveLength(0);
  });

  it("cannot see other members' profiles or search the directory, but can still see their own", async () => {
    expect((await unverified.client.from("profiles").select("id").eq("id", verified.id)).data ?? []).toHaveLength(0);
    expect((await unverified.client.from("profiles").select("id").eq("id", unverified.id)).data).toHaveLength(1);
    const found = await unverified.client.rpc("search_people", { p_query: "cn-verified" });
    expect((found.data ?? []).map((p) => p.id)).not.toContain(verified.id);
  });

  it("cannot message members, and cannot read the ideas board", async () => {
    expect((await unverified.client.rpc("start_direct_conversation", { p_other: verified.id })).error).not.toBeNull();

    await admin.from("feedback_items").insert({ user_id: verified.id, college_id: GREENFIELD, kind: "feature", title: `Visible idea ${tag}`, body: "An idea for the board, long enough.", is_public: true });
    expect((await verified.client.from("feedback_items").select("id").like("title", `%${tag}%`)).data.length).toBeGreaterThan(0);
    expect((await unverified.client.from("feedback_items").select("id").like("title", `%${tag}%`)).data ?? []).toHaveLength(0);
  });

  it("can verify (the way in is never closed), and then sees the network", async () => {
    const p = (await post(verified, "college")).data;
    expect((await unverified.client.from("posts").select("id").eq("id", p?.id ?? "00000000-0000-0000-0000-000000000000")).data ?? []).toHaveLength(0);
    await admin.from("profiles").update({ verification_status: "verified", verified_at: new Date().toISOString() }).eq("id", unverified.id);
    expect((await unverified.client.from("posts").select("id").like("slug", `%-cn-${tag}`)).data.length).toBeGreaterThan(0);
    await admin.from("profiles").update({ verification_status: "unverified", verified_at: null }).eq("id", unverified.id);
  });
});

describe("with verification not required (development default)", () => {
  it("any signed-in member can browse, but logged-out visitors still cannot", async () => {
    await setSetting("college_verification_required", false);
    const p = (await verified.client.from("posts").select("id").like("slug", `college-cn-${tag}`).limit(1)).data[0];
    expect((await unverified.client.from("posts").select("id").eq("id", p.id)).data).toHaveLength(1);
    expect((await anon().from("posts").select("id").eq("id", p.id)).data ?? []).toHaveLength(0);
    // other colleges' members see "public" content only
    expect((await outsider.client.from("posts").select("id").eq("id", p.id)).data ?? []).toHaveLength(0); // college-only
    await setSetting("college_verification_required", true);
  });
});
