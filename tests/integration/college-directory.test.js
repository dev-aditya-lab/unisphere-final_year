import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, anon, cleanupUsers, createUser, grantRoleDirect } from "../helpers/supabase.js";

/**
 * The community-grown college directory: search, add by name with duplicate protection (including simultaneous
 * requests), reports, the "choosing a college is not verification" rule, and who may do what.
 */
const tag = Math.random().toString(36).slice(2, 8);
const word = (n) => `Zq${tag}${n}`; // a made-up word, so tests never collide with real data
const created = [];
let member, other, moderator, globalAdmin;
// A member may add only a handful of colleges a day (that is tested below), so the tests spread creations over a pool.
const pool = [];
let cursor = 0;
const next = () => pool[Math.floor(cursor++ / 4) % pool.length];

const create = (u, args) =>
  u.client.rpc("create_community_college", { p_name: args.name, p_city: args.city ?? null, p_state: args.state ?? null, p_country: args.country ?? null, p_website: args.website ?? null, p_force: args.force ?? false });

async function make(u, args) {
  // Fixtures may legitimately look like other fixtures; confirm they are different so they are always created.
  const res = await create(u, { force: true, ...args });
  expect(res.error, JSON.stringify(res.error)).toBeNull();
  if (res.data.status === "created") created.push(res.data.college.id);
  return res.data;
}

beforeAll(async () => {
  // Fixtures from earlier runs would look like near-duplicates of this run's. Audit entries (append-only) keep them
  // from being deleted, so they are simply hidden from search.
  await admin.from("colleges").update({ is_active: false }).like("name", "Zq%");
  member = await createUser("cd-member", { accountType: null, collegeId: null });
  other = await createUser("cd-other", { accountType: null, collegeId: null });
  moderator = await createUser("cd-mod", { accountType: null, collegeId: null });
  globalAdmin = await createUser("cd-admin", { accountType: null, collegeId: null });
  await grantRoleDirect(moderator.id, "moderator", null);
  await grantRoleDirect(globalAdmin.id, "global_admin", null);
  for (let i = 0; i < 12; i++) pool.push(await createUser(`cd-pool-${i}`, { accountType: null, collegeId: null }));
});

afterAll(async () => {
  await admin.from("college_reports").delete().in("college_id", created);
  await admin.from("colleges").update({ is_active: false }).like("name", "Zq%");
  await cleanupUsers();
});

describe("adding a college by name", () => {
  it("needs only a name, and is labelled community-added and unverified", async () => {
    const creator = next();
    const r = await make(creator, { name: `${word(1)} Institute of Technology` });
    expect(r.status).toBe("created");
    expect(r.college).toMatchObject({ name: `${word(1)} Institute of Technology`, listing_status: "community", is_active: true });
    expect(r.college.city).toBeNull();
    const row = (await admin.from("colleges").select("created_by, normalized_name, name_key").eq("id", r.college.id).single()).data;
    expect(row.created_by).toBe(creator.id);
    expect(row.normalized_name).toBe(`${word(1)} institute of technology`.toLowerCase());
  });

  it("returns the existing record for the same name, however it is spelled or ordered", async () => {
    const first = await make(next(), { name: `${word(2)} College of Engineering`, city: "Ramgarh" });
    expect(first.status).toBe("created");
    for (const name of [`${word(2)} college of engineering`, `College of Engineering, ${word(2)}`, `${word(2)} Engg. College`, `  ${word(2)}   Engineering   College  `]) {
      const again = await create(next(), { name });
      expect(again.error, name).toBeNull();
      expect(again.data.status, name).toBe("existing");
      expect(again.data.college.id, name).toBe(first.college.id);
    }
  });

  it("treats the same name in a different city as a different college", async () => {
    const a = await make(next(), { name: `${word(3)} Government Polytechnic`, city: "Bokaro" });
    const b = await create(next(), { name: `${word(3)} Government Polytechnic`, city: "Dhanbad" });
    expect(b.error).toBeNull();
    expect(b.data.status).toBe("created");
    created.push(b.data.college.id);
    expect(b.data.college.id).not.toBe(a.college.id);
    // with no city given, it resolves to an existing one instead of creating a third
    const c = await create(next(), { name: `${word(3)} Government Polytechnic` });
    expect(c.data.status).toBe("existing");
  });

  it("asks before adding something that looks like an existing record, and adds it when confirmed", async () => {
    await make(next(), { name: `${word(4)} Mahavidyalaya Autonomous` });
    const near = await create(next(), { name: `${word(4)} Mahavidyalaya Autonomus` }); // typo
    expect(near.error).toBeNull();
    expect(near.data.status).toBe("similar");
    expect(near.data.candidates.length).toBeGreaterThan(0);
    const forced = await create(next(), { name: `${word(4)} Mahavidyalaya Autonomus`, force: true });
    expect(forced.data.status).toBe("created");
    created.push(forced.data.college.id);
  });

  it("creates exactly one record when many people add the same college at once", async () => {
    const people = await Promise.all(Array.from({ length: 6 }, (_, i) => createUser(`cd-race-${i}`, { accountType: null, collegeId: null })));
    const name = `${word(5)} Race Condition University`;
    const results = await Promise.all(people.map((u) => create(u, { name })));
    for (const r of results) expect(r.error, JSON.stringify(r.error)).toBeNull();
    const statuses = results.map((r) => r.data.status);
    expect(statuses.filter((s) => s === "created")).toHaveLength(1);
    expect(statuses.filter((s) => s === "existing")).toHaveLength(5);
    const ids = new Set(results.map((r) => r.data.college.id));
    expect(ids.size).toBe(1);
    created.push([...ids][0]);
    const { data } = await admin.from("colleges").select("id").ilike("name", `${word(5)}%`);
    expect(data).toHaveLength(1);
  });

  it("rejects links, symbols-only names, bad websites and absurd lengths", async () => {
    for (const [args, code] of [
      [{ name: "ab" }, "invalid_college_name"],
      [{ name: "Visit www.spam.example now" }, "invalid_college_name"],
      [{ name: "<script>alert(1)</script>" }, "invalid_college_name"],
      [{ name: "12345 6789" }, "invalid_college_name"],
      [{ name: `${word(6)} College`, website: "javascript:alert(1)" }, "invalid_website"],
      [{ name: `${word(6)} College`, city: "x".repeat(200) }, "invalid_location"],
    ]) {
      const res = await create(next(), args);
      expect(res.error?.message, JSON.stringify(args)).toContain(code);
    }
  });

  it("limits how many a single member can add in a day", async () => {
    const spammer = await createUser("cd-spam", { accountType: null, collegeId: null });
    const outcomes = [];
    for (let i = 0; i < 7; i++) {
      const r = await create(spammer, { name: `${word(7)}${"abcdefg"[i]} Distinct Unrelated Academy ${i * 977}` , force: true });
      outcomes.push(r.error ? r.error.message : r.data.status);
      if (!r.error && r.data.status === "created") created.push(r.data.college.id);
    }
    expect(outcomes.slice(0, 5).every((o) => o === "created")).toBe(true);
    expect(outcomes.slice(5).every((o) => String(o).includes("rate_limited"))).toBe(true);
  });
});

describe("finding colleges", () => {
  it("finds by name, prefix, short name and alias, with a member count", async () => {
    const c = await make(next(), { name: `${word(8)} Zenith Institute`, city: "Ranchi", state: "Jharkhand", country: "India" });
    await admin.from("colleges").update({ short_name: `ZI${tag.slice(0, 4)}` }).eq("id", c.college.id);
    await admin.from("college_aliases").insert({ college_id: c.college.id, alias: `Old ${word(8)} Polytechnic` });
    await admin.from("profiles").update({ college_id: c.college.id }).eq("id", other.id);

    for (const q of [`${word(8)} zen`, word(8), `ZI${tag.slice(0, 4)}`, `old ${word(8)} poly`]) {
      const res = await member.client.rpc("search_colleges", { p_q: q });
      expect(res.error, q).toBeNull();
      const hit = res.data.find((r) => r.id === c.college.id);
      expect(hit, q).toBeTruthy();
      expect(hit).toMatchObject({ city: "Ranchi", state: "Jharkhand", country: "India", listing_status: "community" });
      expect(Number(hit.member_count)).toBe(1);
    }
    await admin.from("profiles").update({ college_id: null }).eq("id", other.id);
  });

  it("ignores one-letter queries and hidden colleges", async () => {
    expect((await member.client.rpc("search_colleges", { p_q: "z" })).data).toEqual([]);
    const c = await make(next(), { name: `${word(9)} Hidden Hall College` });
    await admin.from("colleges").update({ is_active: false }).eq("id", c.college.id);
    expect((await member.client.rpc("search_colleges", { p_q: `${word(9)} hidden` })).data).toEqual([]);
  });

  it("the directory listing counts real members", async () => {
    const c = await make(next(), { name: `${word(10)} Counting College` });
    await admin.from("profiles").update({ college_id: c.college.id }).in("id", [member.id, other.id]);
    const { data } = await member.client.rpc("list_colleges_directory", { p_q: `${word(10)} counting` });
    expect(data).toHaveLength(1);
    expect(Number(data[0].member_count)).toBe(2);
    await admin.from("profiles").update({ college_id: null }).in("id", [member.id, other.id]);
  });
});

describe("choosing a college is not verification", () => {
  it("lets a member set, change and clear their own college, and nothing more", async () => {
    const a = await make(next(), { name: `${word(11)} Alpha College` });
    const b = await make(next(), { name: `${word(11)} Bravo College of Arts` });
    expect((await member.client.rpc("set_my_college", { p_college: a.college.id })).error).toBeNull();
    expect((await admin.from("profiles").select("college_id, verification_status, verified_at").eq("id", member.id).single()).data).toMatchObject({
      college_id: a.college.id, verification_status: "unverified", verified_at: null,
    });
    // a second college becomes the main one and the first stays on the list; clearing the main one hands over to another listed college
    const main = async () => (await admin.from("profiles").select("college_id").eq("id", member.id).single()).data.college_id;
    expect((await member.client.rpc("set_my_college", { p_college: b.college.id })).error).toBeNull();
    expect(await main()).toBe(b.college.id);
    expect((await member.client.rpc("set_my_college", { p_college: null })).error).toBeNull();
    expect(await main()).not.toBe(b.college.id);
    // removing a college takes it off the list; removing every one leaves the member with none
    const listed = (await admin.from("profile_education").select("college_id").eq("user_id", member.id)).data.map((r) => r.college_id);
    for (const id of listed) expect((await member.client.rpc("remove_my_college", { p_college: id })).error).toBeNull();
    expect(await main()).toBeNull();
    // a college that does not exist, or is hidden, cannot be chosen
    expect((await member.client.rpc("set_my_college", { p_college: "00000000-0000-4000-8000-00000000dead" })).error?.message).toContain("college_not_found");
  });

  it("never lets a member write another member's college or their own trust fields", async () => {
    const c = await make(next(), { name: `${word(12)} Guarded College` });
    const theirs = await member.client.from("profiles").update({ college_id: c.college.id }).eq("id", other.id).select("id");
    expect(theirs.data ?? []).toHaveLength(0);
    const own = await member.client.from("profiles").update({ verification_status: "verified" }).eq("id", member.id);
    expect(own.error).not.toBeNull();
    // community listings cannot be edited or "verified" by their creator through the API
    const edit = await member.client.from("colleges").update({ listing_status: "verified", name: "Hacked" }).eq("id", c.college.id).select("id");
    expect(edit.data ?? []).toHaveLength(0);
    expect((await admin.from("colleges").select("name, listing_status").eq("id", c.college.id).single()).data).toMatchObject({ listing_status: "community" });
  });

  it("no member-added college is ever verified: only staff-curated listings can be", async () => {
    const { data } = await admin.from("colleges").select("id, created_by").eq("listing_status", "verified");
    for (const c of data) expect(c.created_by, c.id).toBeNull();
    const { data: memberAdded } = await admin.from("colleges").select("listing_status").not("created_by", "is", null);
    for (const c of memberAdded) expect(c.listing_status).toBe("community");
  });
});

describe("reports, corrections and moderation", () => {
  it("lets members report once per kind, and only staff read the queue", async () => {
    const c = await make(next(), { name: `${word(13)} Reported College` });
    const r1 = await other.client.rpc("report_college", { p_college: c.college.id, p_kind: "correction", p_field: "city", p_proposed: "Ranchi", p_note: "wrong city" });
    expect(r1.error).toBeNull();
    const again = await other.client.rpc("report_college", { p_college: c.college.id, p_kind: "correction", p_field: "city", p_proposed: "Patna" });
    expect(again.error?.message).toContain("already_reported");
    expect((await other.client.rpc("report_college", { p_college: c.college.id, p_kind: "duplicate" })).error?.message).toContain("invalid_duplicate");
    expect((await other.client.rpc("report_college", { p_college: c.college.id, p_kind: "correction" })).error?.message).toContain("invalid_correction");

    // a member sees only their own reports; the admin queue is staff only
    expect((await other.client.from("college_reports").select("id").eq("college_id", c.college.id)).data).toHaveLength(1);
    expect((await member.client.from("college_reports").select("id").eq("college_id", c.college.id)).data ?? []).toHaveLength(0);
    expect((await member.client.rpc("admin_list_college_reports", { p_status: "open" })).error?.message).toContain("forbidden");
    const queue = await moderator.client.rpc("admin_list_college_reports", { p_status: "open" });
    expect(queue.error).toBeNull();
    expect(queue.data.some((r) => r.college_id === c.college.id)).toBe(true);
  });

  it("applies an accepted correction, and lets moderators edit but not verify or merge", async () => {
    const c = await make(next(), { name: `${word(14)} Correctable College`, city: "Wrongville" });
    await other.client.rpc("report_college", { p_college: c.college.id, p_kind: "correction", p_field: "city", p_proposed: "Rightville" });
    const open = (await moderator.client.rpc("admin_list_college_reports", { p_status: "open" })).data.find((r) => r.college_id === c.college.id);
    expect((await moderator.client.rpc("admin_resolve_college_report", { p_id: open.id, p_decision: "accepted", p_note: "thanks" })).error).toBeNull();
    expect((await admin.from("colleges").select("city").eq("id", c.college.id).single()).data.city).toBe("Rightville");

    const base = { p_id: c.college.id, p_name: `${word(14)} Correctable College`, p_short_name: null, p_city: "Rightville", p_state: null, p_country: null, p_website: null, p_description: "A place.", p_listing_status: "community", p_is_active: true };
    expect((await moderator.client.rpc("admin_update_college_listing", base)).error).toBeNull();
    expect((await moderator.client.rpc("admin_update_college_listing", { ...base, p_listing_status: "verified" })).error?.message).toContain("forbidden");
    expect((await member.client.rpc("admin_update_college_listing", base)).error?.message).toContain("forbidden");
    expect((await globalAdmin.client.rpc("admin_update_college_listing", { ...base, p_listing_status: "verified" })).error).toBeNull();
    await admin.from("colleges").update({ listing_status: "community" }).eq("id", c.college.id);

    const other2 = await make(next(), { name: `${word(14)} Another Entirely Different Institute` });
    expect((await moderator.client.rpc("admin_merge_colleges", { p_source: c.college.id, p_target: other2.college.id })).error?.message).toContain("forbidden");
  });

  it("merges a duplicate: members move, the old record redirects, and nothing is lost", async () => {
    const keep = await make(next(), { name: `${word(15)} Keeper University`, city: "Alpha" });
    const dupe = await create(next(), { name: `${word(15)} Keeper Univ Campus Two`, city: "Beta", force: true });
    expect(dupe.error, JSON.stringify(dupe.error)).toBeNull();
    created.push(dupe.data.college.id);
    await admin.from("profiles").update({ college_id: dupe.data.college.id }).eq("id", other.id);
    await admin.from("college_aliases").insert({ college_id: dupe.data.college.id, alias: `${word(15)} KU2` });

    const res = await globalAdmin.client.rpc("admin_merge_colleges", { p_source: dupe.data.college.id, p_target: keep.college.id, p_reason: "same college" });
    expect(res.error).toBeNull();
    expect(res.data.profiles_moved).toBe(1);
    expect((await admin.from("profiles").select("college_id").eq("id", other.id).single()).data.college_id).toBe(keep.college.id);
    const old = (await admin.from("colleges").select("merged_into, is_active").eq("id", dupe.data.college.id).single()).data;
    expect(old).toMatchObject({ merged_into: keep.college.id, is_active: false });
    // old links still resolve, to the record that stayed
    const viaSlug = await member.client.rpc("get_college_by_slug", { p_slug: dupe.data.college.slug });
    expect(viaSlug.data[0].merged_into_slug).toBe(keep.college.slug);
    // aliases (including the old name) now find the survivor
    const found = await member.client.rpc("search_colleges", { p_q: `${word(15)} KU2` });
    expect(found.data.map((r) => r.id)).toContain(keep.college.id);
    expect((await globalAdmin.client.rpc("admin_merge_colleges", { p_source: keep.college.id, p_target: keep.college.id })).error?.message).toContain("invalid_merge");
    await admin.from("profiles").update({ college_id: null }).eq("id", other.id);
  });
});

describe("access", () => {
  it("is unavailable to logged-out visitors", async () => {
    for (const [fn, args] of [
      ["search_colleges", { p_q: "anything" }],
      ["create_community_college", { p_name: `${word(16)} Anonymous College` }],
      ["list_colleges_directory", {}],
      ["report_college", { p_college: "00000000-0000-4000-8000-000000000001", p_kind: "abuse" }],
    ]) {
      const res = await anon().rpc(fn, args);
      expect(res.error, fn).not.toBeNull();
    }
  });
});
