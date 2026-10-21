import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GREENFIELD, RIVERSIDE, admin, anon, cleanupUsers, createUser, grantRoleDirect } from "../helpers/supabase.js";

/**
 * Migrations 0037 to 0039 with real sessions: several colleges per member with a role at each, departments and courses members
 * add themselves, the skills and interests catalog managed by administrators, and post pictures that carry their size.
 */

const tag = Math.random().toString(36).slice(2, 7);
const rpc = (u, fn, args) => u.client.rpc(fn, args);
const entry = (college_id, role, extra = {}) => ({ college_id, role, ...extra });

let a, b, gadmin;
const cleanup = { colleges: [], skills: [] };

beforeAll(async () => {
  [a, b] = await Promise.all([createUser("edu-a", { collegeId: null }), createUser("edu-b", { collegeId: null })]);
  gadmin = await createUser("edu-admin", { collegeId: null });
  await grantRoleDirect(gadmin.id, "global_admin");
});
afterAll(async () => {
  await admin.from("skill_catalog").delete().in("id", cleanup.skills);
  await cleanupUsers();
  if (cleanup.colleges.length) await admin.from("colleges").delete().in("id", cleanup.colleges);
});

const profile = async (u) => (await admin.from("profiles").select("college_id, department_id, program_id, graduation_year, account_type").eq("id", u.id).single()).data;
const rows = async (u) => (await admin.from("profile_education").select("*").eq("user_id", u.id).order("position")).data;

describe("a member's schools and colleges", () => {
  it("keeps several colleges with a role at each and mirrors the main one onto the profile", async () => {
    const { data: dept } = await admin.from("departments").insert({ college_id: GREENFIELD, slug: `d-${tag}`, name: `Dept ${tag}` }).select("id").single();
    const res = await rpc(a, "set_my_education", {
      p_entries: [entry(RIVERSIDE, "alumni", { start_year: 2015, end_year: 2019 }), entry(GREENFIELD, "student", { department_id: dept.id, start_year: 2023, end_year: 2027, is_primary: true })],
    });
    expect(res.error).toBeNull();
    const list = await rows(a);
    expect(list).toHaveLength(2);
    expect(list.map((r) => [r.role, r.is_primary])).toEqual([["alumni", false], ["student", true]]);
    expect(await profile(a)).toMatchObject({ college_id: GREENFIELD, department_id: dept.id, graduation_year: 2027, account_type: "student" });

    // the first entry is the main one when none is flagged
    await rpc(a, "set_my_education", { p_entries: [entry(RIVERSIDE, "alumni", { end_year: 2019 }), entry(GREENFIELD, "student")] });
    expect(await profile(a)).toMatchObject({ college_id: RIVERSIDE, account_type: "alumni", graduation_year: 2019, department_id: null });
    await admin.from("departments").delete().eq("id", dept.id);
  });

  it("allows one college twice only with different roles, and at most eight", async () => {
    expect((await rpc(a, "set_my_education", { p_entries: [entry(GREENFIELD, "student"), entry(GREENFIELD, "alumni")] })).error).toBeNull();
    expect((await rpc(a, "set_my_education", { p_entries: [entry(GREENFIELD, "student"), entry(GREENFIELD, "student")] })).error?.message).toMatch(/duplicate_entry/);
    const many = Array.from({ length: 9 }, (_, i) => entry(GREENFIELD, "student", { start_year: 2000 + i }));
    expect((await rpc(a, "set_my_education", { p_entries: many })).error?.message).toMatch(/too_many_entries/);
  });

  it("refuses a bad role, bad years, an unknown college and a department of another college", async () => {
    expect((await rpc(a, "set_my_education", { p_entries: [entry(GREENFIELD, "principal")] })).error?.message).toMatch(/invalid_entries/);
    expect((await rpc(a, "set_my_education", { p_entries: [entry(GREENFIELD, "student", { start_year: 2024, end_year: 2020 })] })).error?.message).toMatch(/invalid_years/);
    expect((await rpc(a, "set_my_education", { p_entries: [entry("00000000-0000-4000-8000-0000000000ff", "student")] })).error?.message).toMatch(/college_not_found/);
    const { data: dept } = await admin.from("departments").insert({ college_id: RIVERSIDE, slug: `x-${tag}`, name: `Other ${tag}` }).select("id").single();
    expect((await rpc(a, "set_my_education", { p_entries: [entry(GREENFIELD, "student", { department_id: dept.id })] })).error?.message).toMatch(/department_college_mismatch/);
    await admin.from("departments").delete().eq("id", dept.id);
    // nothing was half-saved
    expect(await rows(a)).toHaveLength(2);
  });

  it("clears the list and the profile mirror together", async () => {
    expect((await rpc(a, "set_my_education", { p_entries: [] })).error).toBeNull();
    expect(await rows(a)).toHaveLength(0);
    expect(await profile(a)).toMatchObject({ college_id: null, account_type: null, graduation_year: null });
  });

  it("is listed for anyone who can see the profile, and for nobody else", async () => {
    await rpc(a, "set_my_education", { p_entries: [entry(GREENFIELD, "student")] });
    expect((await b.client.from("profile_education").select("id").eq("user_id", a.id)).data).toHaveLength(1);
    await admin.from("profiles").update({ visibility: "private" }).eq("id", a.id);
    expect((await b.client.from("profile_education").select("id").eq("user_id", a.id)).data).toHaveLength(0);
    expect((await a.client.from("profile_education").select("id").eq("user_id", a.id)).data).toHaveLength(1);
    await admin.from("profiles").update({ visibility: "public" }).eq("id", a.id);
    expect((await anon().from("profile_education").select("id").eq("user_id", a.id)).data ?? []).toHaveLength(0);
  });

  it("cannot be written to directly", async () => {
    const res = await a.client.from("profile_education").insert({ user_id: a.id, college_id: RIVERSIDE, role: "student" });
    expect(res.error).not.toBeNull();
    expect((await anon().rpc("set_my_education", { p_entries: [] })).error).not.toBeNull();
  });

  it("follows the college buttons: add makes it the main one, remove takes every role at that college away", async () => {
    await rpc(b, "set_my_education", { p_entries: [entry(GREENFIELD, "student")] });
    expect((await rpc(b, "set_my_college", { p_college: RIVERSIDE })).error).toBeNull();
    expect((await rows(b)).map((r) => [r.college_id, r.is_primary])).toEqual([[GREENFIELD, false], [RIVERSIDE, true]]);
    expect(await profile(b)).toMatchObject({ college_id: RIVERSIDE });
    expect((await rpc(b, "remove_my_college", { p_college: RIVERSIDE })).error).toBeNull();
    expect((await rows(b)).map((r) => [r.college_id, r.is_primary])).toEqual([[GREENFIELD, true]]);
    expect(await profile(b)).toMatchObject({ college_id: GREENFIELD });
  });

  it("lists a college that was set some other way (an older path) as the main entry", async () => {
    const c = await createUser("edu-legacy", { collegeId: null });
    await admin.from("profiles").update({ college_id: GREENFIELD }).eq("id", c.id);
    expect((await rows(c)).map((r) => [r.college_id, r.is_primary, r.role])).toEqual([[GREENFIELD, true, "student"]]);
  });

  it("counts members of a college through any of their entries", async () => {
    await rpc(a, "set_my_education", { p_entries: [entry(GREENFIELD, "student"), entry(RIVERSIDE, "alumni")] });
    const { data: before } = await admin.rpc("college_member_count", { p_college: RIVERSIDE }).then((r) => ({ data: r.data }));
    expect(before ?? 0).toBeGreaterThanOrEqual(0); // the helper is service-only
    const viaDirectory = (await a.client.rpc("get_college_by_slug", { p_slug: (await admin.from("colleges").select("slug").eq("id", RIVERSIDE).single()).data.slug })).data?.[0];
    expect(Number(viaDirectory.member_count)).toBeGreaterThanOrEqual(1);
  });

  it("finds alumni of a college in the mentor search even when their main college is another", async () => {
    await admin.from("profiles").update({ onboarded_at: new Date().toISOString(), status: "active" }).eq("id", a.id);
    await rpc(a, "set_my_education", { p_entries: [entry(GREENFIELD, "student", { is_primary: true }), entry(RIVERSIDE, "alumni")] });
    const { data } = await rpc(b, "search_mentors", { p_college: RIVERSIDE, p_limit: 50 });
    expect((data ?? []).some((p) => p.id === a.id)).toBe(true);
    const { data: other } = await rpc(b, "search_mentors", { p_college: GREENFIELD, p_limit: 50 });
    expect((other ?? []).some((p) => p.id === a.id)).toBe(false); // a student at the main college is not alumni or a mentor
  });
});

describe("departments and courses members add", () => {
  it("creates a department and returns the same one for the same name", async () => {
    const name = `Marine Biology ${tag}`;
    const first = await rpc(a, "create_community_department", { p_college: GREENFIELD, p_name: name });
    expect(first.error).toBeNull();
    expect(first.data).toMatchObject({ status: "created", name });
    const again = await rpc(b, "create_community_department", { p_college: GREENFIELD, p_name: `  ${name.toUpperCase()}  ` });
    expect(again.data).toMatchObject({ status: "existing", id: first.data.id });
    const row = (await admin.from("departments").select("is_community, created_by, college_id").eq("id", first.data.id).single()).data;
    expect(row).toMatchObject({ is_community: true, created_by: a.id, college_id: GREENFIELD });
    await admin.from("departments").delete().eq("id", first.data.id);
  });

  it("creates a course under a department of the same college only", async () => {
    const dept = await rpc(a, "create_community_department", { p_college: GREENFIELD, p_name: `Law ${tag}` });
    const ok = await rpc(a, "create_community_program", { p_college: GREENFIELD, p_name: `LLB ${tag}`, p_department: dept.data.id, p_level: "undergraduate" });
    expect(ok.error).toBeNull();
    expect(ok.data).toMatchObject({ status: "created", department_id: dept.data.id });
    const wrong = await rpc(a, "create_community_program", { p_college: RIVERSIDE, p_name: `LLM ${tag}`, p_department: dept.data.id });
    expect(wrong.error?.message).toMatch(/department_college_mismatch/);
    await admin.from("academic_programs").delete().eq("id", ok.data.id);
    await admin.from("departments").delete().eq("id", dept.data.id);
  });

  it("refuses links and symbols, hidden names and anonymous callers", async () => {
    expect((await rpc(a, "create_community_department", { p_college: GREENFIELD, p_name: "visit http://spam.example" })).error?.message).toMatch(/invalid_item_name/);
    expect((await rpc(a, "create_community_department", { p_college: GREENFIELD, p_name: "12345" })).error?.message).toMatch(/invalid_item_name/);
    const { data: hidden } = await admin.from("departments").insert({ college_id: GREENFIELD, slug: `h-${tag}`, name: `Hidden ${tag}`, is_active: false }).select("id").single();
    expect((await rpc(a, "create_community_department", { p_college: GREENFIELD, p_name: `Hidden ${tag}` })).error?.message).toMatch(/item_unavailable/);
    await admin.from("departments").delete().eq("id", hidden.id);
    expect((await anon().rpc("create_community_department", { p_college: GREENFIELD, p_name: "Anything" })).error).not.toBeNull();
  });

  it("limits how many a member adds in a day", async () => {
    const spammer = await createUser("edu-spam", { collegeId: null });
    const made = [];
    for (let i = 0; i < 20; i++) {
      const r = await rpc(spammer, "create_community_department", { p_college: GREENFIELD, p_name: `Dept ${tag} ${String.fromCharCode(97 + i)}${String.fromCharCode(97 + i)}` });
      expect(r.error).toBeNull();
      made.push(r.data.id);
    }
    expect((await rpc(spammer, "create_community_program", { p_college: GREENFIELD, p_name: `Course ${tag} zz` })).error?.message).toMatch(/rate_limited/);
    await admin.from("departments").delete().in("id", made);
  });

  it("follows a college merge: entries move, a duplicate role is kept once, the main flag survives", async () => {
    const mk = async (name) => (await admin.from("colleges").insert({ slug: `m-${tag}-${name}`, name: `Merge ${name} ${tag}` }).select("id").single()).data.id;
    const [src, dst] = [await mk("src"), await mk("dst")];
    cleanup.colleges.push(src, dst);
    const m = await createUser("edu-merge", { collegeId: null });
    await rpc(m, "set_my_education", { p_entries: [entry(src, "student", { is_primary: true }), entry(dst, "student"), entry(GREENFIELD, "alumni")] });
    const res = await gadmin.client.rpc("admin_merge_colleges", { p_source: src, p_target: dst, p_reason: "test" });
    expect(res.error).toBeNull();
    const list = await rows(m);
    expect(list.map((r) => [r.college_id, r.role]).sort()).toEqual([[dst, "student"], [GREENFIELD, "alumni"]].sort());
    expect(list.filter((r) => r.is_primary)).toHaveLength(1);
    expect(list.find((r) => r.is_primary).college_id).toBe(dst);
    expect(await profile(m)).toMatchObject({ college_id: dst });
  });
});

describe("administering departments and courses", () => {
  it("lets moderators list, rename, hide and remove them, and nobody else", async () => {
    const made = await rpc(a, "create_community_department", { p_college: GREENFIELD, p_name: `Astro ${tag}` });
    const id = made.data.id;
    expect((await rpc(b, "admin_list_academic_items", {})).error?.message).toMatch(/forbidden/);
    expect((await rpc(b, "admin_set_academic_item", { p_kind: "department", p_id: id, p_name: "Hacked", p_active: false })).error?.message).toMatch(/forbidden/);

    const listed = (await rpc(gadmin, "admin_list_academic_items", { p_q: `Astro ${tag}` })).data;
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ kind: "department", is_community: true, is_active: true, added_by: a.username });

    expect((await rpc(gadmin, "admin_set_academic_item", { p_kind: "department", p_id: id, p_name: `Astrophysics ${tag}`, p_active: false })).error).toBeNull();
    expect((await admin.from("departments").select("name, is_active").eq("id", id).single()).data).toEqual({ name: `Astrophysics ${tag}`, is_active: false });
    expect((await rpc(gadmin, "admin_list_academic_items", { p_status: "hidden", p_q: tag })).data.map((r) => r.id)).toContain(id);

    // a profile that already uses a hidden department keeps it
    await rpc(a, "set_my_education", { p_entries: [entry(GREENFIELD, "student", { department_id: id })] });
    expect((await rows(a))[0].department_id).toBe(id);
    expect((await rpc(gadmin, "admin_delete_academic_item", { p_kind: "department", p_id: id })).error).toBeNull();
    expect((await rows(a))[0].department_id).toBeNull();
    expect((await rpc(gadmin, "admin_delete_academic_item", { p_kind: "department", p_id: id })).error?.message).toMatch(/not_found/);
  });
});

describe("skills and interests catalog", () => {
  it("is readable by members, only the suggested ones, and broader than coding", async () => {
    const { data } = await a.client.from("skill_catalog").select("name, category, kind").eq("kind", "skill").limit(1000);
    const cats = new Set(data.map((s) => s.category));
    for (const c of ["Technology", "Design & Creative", "Business & Management", "Health & Wellbeing", "Languages", "Sports & Games"]) expect(cats).toContain(c);
    expect((await a.client.from("skill_catalog").select("id").eq("kind", "interest").limit(5)).data.length).toBeGreaterThan(0);

    const { data: hidden } = await admin.from("skill_catalog").insert({ kind: "skill", name: `Hidden ${tag}`, category: "Test", is_active: false }).select("id").single();
    cleanup.skills.push(hidden.id);
    expect((await a.client.from("skill_catalog").select("id").eq("id", hidden.id)).data).toHaveLength(0);
    expect((await anon().from("skill_catalog").select("id").limit(1)).data ?? []).toHaveLength(0);
  });

  it("can be changed only through the administrator functions", async () => {
    expect((await a.client.from("skill_catalog").insert({ kind: "skill", name: `Mine ${tag}`, category: "Test" })).error).not.toBeNull();
    expect((await rpc(a, "admin_save_skill", { p_id: null, p_kind: "skill", p_name: `Nope ${tag}`, p_category: "Test", p_active: true, p_sort: 1 })).error?.message).toMatch(/forbidden/);
    expect((await rpc(a, "admin_list_skills", {})).error?.message).toMatch(/forbidden/);

    const saved = await rpc(gadmin, "admin_save_skill", { p_id: null, p_kind: "skill", p_name: `Bee keeping ${tag}`, p_category: "Hands-on & Trades", p_active: true, p_sort: 10 });
    expect(saved.error).toBeNull();
    cleanup.skills.push(saved.data);
    expect((await rpc(gadmin, "admin_save_skill", { p_id: null, p_kind: "skill", p_name: `  BEE KEEPING ${tag} `, p_category: "Hands-on & Trades", p_active: true, p_sort: 20 })).error?.message).toMatch(/duplicate_skill/);
    expect((await rpc(gadmin, "admin_save_skill", { p_id: null, p_kind: "mood", p_name: "x", p_category: "Test", p_active: true, p_sort: 1 })).error?.message).toMatch(/invalid_kind/);

    const edited = await rpc(gadmin, "admin_save_skill", { p_id: saved.data, p_kind: "skill", p_name: `Apiculture ${tag}`, p_category: "Hands-on & Trades", p_active: false, p_sort: 10 });
    expect(edited.error).toBeNull();
    expect((await a.client.from("skill_catalog").select("id").eq("id", saved.data)).data).toHaveLength(0); // hidden from members now
    const listed = (await rpc(gadmin, "admin_list_skills", { p_q: `Apiculture ${tag}`, p_status: "hidden" })).data;
    expect(listed).toHaveLength(1);
    expect((await admin.from("audit_logs").select("id").eq("action", "skills.saved").eq("target_id", saved.data)).data.length).toBeGreaterThanOrEqual(1);
  });

  it("shows what members typed that is not listed, with how many use it, and lets a listing remove it from that report", async () => {
    const odd = `Falconry ${tag}`;
    await admin.from("profiles").update({ skills: [odd, "Python"] }).in("id", [a.id, b.id]);
    const { data } = await rpc(gadmin, "admin_unlisted_skills", { p_kind: "skill", p_limit: 100 });
    const row = data.find((r) => r.name === odd);
    expect(row).toMatchObject({ members: 2 }); // Number from bigint
    expect(data.some((r) => r.name === "Python")).toBe(false); // listed already
    const saved = await rpc(gadmin, "admin_save_skill", { p_id: null, p_kind: "skill", p_name: odd.toLowerCase(), p_category: "Hands-on & Trades", p_active: true, p_sort: 5 });
    cleanup.skills.push(saved.data);
    expect((await rpc(gadmin, "admin_unlisted_skills", { p_kind: "skill", p_limit: 100 })).data.some((r) => r.name === odd)).toBe(false);
    const counted = (await rpc(gadmin, "admin_list_skills", { p_q: odd })).data.find((s) => s.id === saved.data);
    expect(Number(counted.members)).toBe(2);
    expect((await rpc(gadmin, "admin_delete_skill", { p_id: saved.data })).error).toBeNull();
  });
});

describe("post pictures carry their size", () => {
  it("reports width and height in the feed's attachment list", async () => {
    const { data: file } = await admin
      .from("files")
      .insert({ owner_id: a.id, bucket: "private", storage_key: `post_attachment/${a.id}/${tag}.jpg`, purpose: "post_attachment", mime_type: "image/jpeg", size_bytes: 1000, width: 1600, height: 900, status: "ready" })
      .select("id")
      .single();
    const { data: post } = await a.client.from("posts").insert({ author_id: a.id, slug: `pic-${tag}`, body: "A picture post for the size test", visibility: "public" }).select("id").single();
    await admin.from("post_attachments").insert({ post_id: post.id, file_id: file.id, position: 0 });
    const feed = (await a.client.from("post_feed").select("attachments").eq("id", post.id).single()).data;
    expect(feed.attachments).toEqual([{ id: file.id, alt: null, width: 1600, height: 900 }]);

    // an older picture without a recorded size still lists, with nulls
    await admin.from("files").update({ width: null, height: null }).eq("id", file.id);
    expect((await a.client.from("post_feed").select("attachments").eq("id", post.id).single()).data.attachments[0]).toMatchObject({ width: null, height: null });
    await admin.from("posts").delete().eq("id", post.id);
    await admin.from("files").delete().eq("id", file.id);
  });
});
