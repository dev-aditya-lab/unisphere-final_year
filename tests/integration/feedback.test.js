import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GREENFIELD, RIVERSIDE, admin, anon, cleanupUsers, createUser, grantRoleDirect } from "../helpers/supabase.js";

/** Feedback, bug reports, feature voting, roadmap, changelog and push claiming, with real sessions. */
let alice, bob, carol, outsider, product, support, collegeAdmin;
const tag = Math.random().toString(36).slice(2, 7);
const rpc = (u, fn, args) => u.client.rpc(fn, args);
const submit = (u, over = {}) => rpc(u, "submit_feedback", { p_kind: "feature", p_title: `Dark mode ${tag}`, p_body: "It would be easier on the eyes at night.", p_severity: null, p_area: "profile", p_context: { path: "/feed" }, ...over });

beforeAll(async () => {
  alice = await createUser("fb-alice");
  bob = await createUser("fb-bob");
  carol = await createUser("fb-carol");
  outsider = await createUser("fb-out", { collegeId: RIVERSIDE });
  product = await createUser("fb-product");
  support = await createUser("fb-support");
  collegeAdmin = await createUser("fb-cadmin");
  await grantRoleDirect(product.id, "global_admin");
  await grantRoleDirect(support.id, "support_agent");
  await grantRoleDirect(collegeAdmin.id, "college_admin", GREENFIELD);
});
afterAll(async () => {
  await admin.from("feedback_items").delete().like("title", `%${tag}%`);
  await admin.from("releases").delete().like("version", "9.%");
  await cleanupUsers();
});

describe("submitting", () => {
  it("stores feature requests as public to the college, with the author's own vote", async () => {
    const res = await submit(alice);
    expect(res.error).toBeNull();
    const { data } = await admin.from("feedback_items").select("kind, is_public, vote_count, college_id, context").eq("id", res.data).single();
    expect(data).toMatchObject({ kind: "feature", is_public: true, vote_count: 1, college_id: GREENFIELD });
    expect(data.context.path).toBe("/feed");
  });

  it("keeps bugs and feedback private to the reporter and the product team", async () => {
    const bug = await submit(alice, { p_kind: "bug", p_title: `Crash on upload ${tag}`, p_severity: "high", p_area: "feed" });
    expect(bug.error).toBeNull();
    const { data: row } = await admin.from("feedback_items").select("is_public, severity").eq("id", bug.data).single();
    expect(row).toMatchObject({ is_public: false, severity: "high" });

    expect((await alice.client.from("feedback_items").select("id").eq("id", bug.data)).data).toHaveLength(1);
    expect((await bob.client.from("feedback_items").select("id").eq("id", bug.data)).data).toEqual([]);
    expect((await collegeAdmin.client.from("feedback_items").select("id").eq("id", bug.data)).data).toEqual([]); // college admins are not the product team
    expect((await product.client.from("feedback_items").select("id").eq("id", bug.data)).data).toHaveLength(1);
    expect((await support.client.from("feedback_items").select("id").eq("id", bug.data)).data).toHaveLength(1);
    expect((await anon().from("feedback_items").select("id")).data ?? []).toEqual([]);
  });

  it("validates text, rejects same-day duplicates and caps submissions per day", async () => {
    expect((await submit(alice, { p_title: "Hi" })).error?.message).toMatch(/invalid_text/);
    expect((await submit(alice, { p_kind: "nope" })).error?.message).toMatch(/invalid_kind/);
    expect((await submit(alice)).error?.message).toMatch(/duplicate_submission/);
    for (let i = 0; i < 9; i++) await submit(carol, { p_title: `Idea number ${i} ${tag}`, p_kind: "feedback" });
    expect((await submit(carol, { p_title: `Idea number 9 ${tag}`, p_kind: "feedback" })).error).toBeNull();
    expect((await submit(carol, { p_title: `Idea number 10 ${tag}`, p_kind: "feedback" })).error?.message).toMatch(/rate_limited/);
  });

  it("does not let restricted members submit", async () => {
    const r = await createUser("fb-restricted");
    await admin.from("profiles").update({ status: "suspended" }).eq("id", r.id);
    expect((await submit(r, { p_title: `Let me in ${tag}` })).error?.message).toMatch(/account_restricted/);
  });
});

describe("the idea board and voting", () => {
  let ideaId;
  beforeAll(async () => {
    ideaId = (await admin.from("feedback_items").select("id").eq("kind", "feature").like("title", `Dark mode ${tag}`).single()).data.id;
  });

  it("shows ideas to the same college only", async () => {
    expect((await bob.client.from("feedback_items").select("id").eq("id", ideaId)).data).toHaveLength(1);
    expect((await outsider.client.from("feedback_items").select("id").eq("id", ideaId)).data).toEqual([]);
  });

  it("lets members vote once, toggle their vote off, and keeps the count honest", async () => {
    expect((await rpc(bob, "toggle_feedback_vote", { p_item: ideaId })).data).toBe(true);
    expect((await rpc(carol, "toggle_feedback_vote", { p_item: ideaId })).data).toBe(true);
    expect((await admin.from("feedback_items").select("vote_count").eq("id", ideaId).single()).data.vote_count).toBe(3);
    expect((await rpc(bob, "toggle_feedback_vote", { p_item: ideaId })).data).toBe(false);
    expect((await admin.from("feedback_items").select("vote_count").eq("id", ideaId).single()).data.vote_count).toBe(2);
    // members can only see their own votes
    expect((await bob.client.from("feedback_votes").select("user_id")).data.every((v) => v.user_id === bob.id)).toBe(true);
    // other colleges cannot vote, and nobody can write votes directly
    expect((await rpc(outsider, "toggle_feedback_vote", { p_item: ideaId })).error?.message).toMatch(/not_found/);
    expect((await bob.client.from("feedback_votes").insert({ item_id: ideaId, user_id: bob.id })).error).not.toBeNull();
  });
});

describe("the product team", () => {
  let ideaId, dupId;
  beforeAll(async () => {
    ideaId = (await admin.from("feedback_items").select("id").like("title", `Dark mode ${tag}`).single()).data.id;
    dupId = (await submit(bob, { p_title: `Night theme please ${tag}` })).data;
  });

  it("is limited to the product team", async () => {
    for (const u of [alice, collegeAdmin]) {
      expect((await rpc(u, "admin_list_feedback", {})).error?.message, u.username).toMatch(/forbidden/);
      expect((await rpc(u, "triage_feedback", { p_id: ideaId, p_status: "planned" })).error?.message).toMatch(/forbidden/);
    }
    const list = await rpc(support, "admin_list_feedback", { p_kind: "feature", p_q: tag });
    expect(list.error).toBeNull();
    expect(list.data.length).toBeGreaterThanOrEqual(2);
  });

  it("merges duplicates (moving their votes), plans ideas, and tells the reporter", async () => {
    expect((await rpc(product, "triage_feedback", { p_id: dupId, p_status: "duplicate" })).error?.message).toMatch(/invalid_duplicate/);
    const before = (await admin.from("feedback_items").select("vote_count").eq("id", ideaId).single()).data.vote_count;
    expect((await rpc(product, "triage_feedback", { p_id: dupId, p_status: "duplicate", p_duplicate_of: ideaId })).error).toBeNull();
    const after = (await admin.from("feedback_items").select("vote_count").eq("id", ideaId).single()).data.vote_count;
    expect(after).toBe(before + 1); // bob's own vote on the duplicate now backs the original
    expect((await bob.client.from("feedback_items").select("id").eq("id", dupId)).data).toHaveLength(1); // the author can still see their own

    expect((await rpc(product, "triage_feedback", { p_id: ideaId, p_status: "declined" })).error?.message).toMatch(/reason_required/);
    expect((await rpc(product, "triage_feedback", { p_id: ideaId, p_status: "planned", p_response: "Coming after exams" })).error).toBeNull();
    const n = (await admin.from("notifications").select("type, data").eq("user_id", alice.id).eq("type", "feedback_update")).data;
    expect(n).toHaveLength(1);
    expect(n[0].data).toMatchObject({ status: "planned", response: "Coming after exams" });
    expect((await admin.from("audit_logs").select("action").eq("actor_id", product.id).eq("action", "feedback.triaged")).data.length).toBeGreaterThan(0);
  });
});

describe("roadmap and changelog are public", () => {
  it("exposes only titles, status and counts for planned and shipped ideas", async () => {
    const res = await anon().rpc("public_roadmap");
    expect(res.error).toBeNull();
    const item = res.data.find((i) => i.title === `Dark mode ${tag}`);
    expect(item).toMatchObject({ status: "planned", public_response: "Coming after exams" });
    expect(Object.keys(item).sort()).toEqual(["area", "college_name", "id", "public_response", "status", "title", "version", "vote_count"]);
    expect(res.data.some((i) => i.title.startsWith("Crash on upload"))).toBe(false); // bugs never appear
  });

  it("shows published releases to everyone, drafts only to the team, and edits only by the team", async () => {
    expect((await rpc(alice, "save_release", { p_id: null, p_version: "9.0.0", p_title: "Nope", p_summary: null, p_items: [], p_publish: true })).error?.message).toMatch(/forbidden/);
    const draft = await rpc(product, "save_release", { p_id: null, p_version: "9.1.0", p_title: "Draft release", p_summary: "Soon", p_items: [{ kind: "new", text: "Something" }], p_publish: false });
    expect(draft.error).toBeNull();
    expect((await anon().from("releases").select("version").eq("version", "9.1.0")).data).toEqual([]);
    expect((await product.client.from("releases").select("version").eq("version", "9.1.0")).data).toHaveLength(1);

    expect((await rpc(product, "save_release", { p_id: draft.data, p_version: "9.1.0", p_title: "Draft release", p_summary: "Soon", p_items: [{ kind: "new", text: "Something" }], p_publish: true })).error).toBeNull();
    const pub = (await anon().from("releases").select("version, published_at, items").eq("version", "9.1.0")).data;
    expect(pub).toHaveLength(1);
    expect(pub[0].items[0].text).toBe("Something");
    expect((await rpc(product, "save_release", { p_id: null, p_version: "9.1.0", p_title: "Again", p_summary: null, p_items: [], p_publish: false })).error?.message).toMatch(/version_exists/);
    expect((await rpc(product, "delete_release", { p_id: draft.data })).error?.message).toMatch(/already_published/);
    expect((await rpc(product, "save_release", { p_id: null, p_version: "bad", p_title: "x", p_summary: null, p_items: [], p_publish: false })).error).not.toBeNull();
  });

  it("ships with the real release history", async () => {
    const { data } = await anon().from("releases").select("version, title").order("version");
    expect(data.map((r) => r.version)).toEqual(expect.arrayContaining(["0.1.0", "0.6.0", "0.7.0", "0.8.0"]));
  });
});

describe("push claiming", () => {
  it("claims fresh unread notifications for subscribed members exactly once", async () => {
    await admin.from("push_subscriptions").insert({ user_id: alice.id, endpoint: `https://push.invalid/${tag}`, p256dh: "k", auth: "a" });
    await admin.from("notifications").insert([
      { user_id: alice.id, type: "follow", category: "social", data: {} },
      { user_id: alice.id, type: "follow", category: "social", data: {}, read_at: new Date().toISOString() }, // already read: no push
      { user_id: bob.id, type: "follow", category: "social", data: {} }, // no subscription: no push
    ]);
    const first = await admin.rpc("claim_push_notifications", { p_limit: 50 });
    expect(first.error).toBeNull();
    expect(first.data.filter((r) => r.user_id === alice.id && r.type === "follow")).toHaveLength(1); // the read one is skipped
    expect(first.data.some((r) => r.user_id === bob.id)).toBe(false);
    expect((await admin.rpc("claim_push_notifications", { p_limit: 50 })).data.filter((r) => r.user_id === alice.id)).toHaveLength(0); // never twice
    // members cannot call it
    expect((await rpc(alice, "claim_push_notifications", { p_limit: 5 })).error).not.toBeNull();
  });

  it("lets members see and remove only their own devices", async () => {
    const mine = await alice.client.from("push_subscriptions").select("endpoint");
    expect(mine.data.every((d) => d.endpoint.includes(tag))).toBe(true);
    expect((await bob.client.from("push_subscriptions").select("id")).data).toEqual([]);
    await bob.client.from("push_subscriptions").delete().eq("endpoint", `https://push.invalid/${tag}`);
    expect((await admin.from("push_subscriptions").select("id").eq("endpoint", `https://push.invalid/${tag}`)).data).toHaveLength(1);
    expect((await alice.client.from("push_subscriptions").insert({ user_id: alice.id, endpoint: "https://x.test/y", p256dh: "a", auth: "b" })).error).not.toBeNull(); // subscribing goes through the server
  });
});
