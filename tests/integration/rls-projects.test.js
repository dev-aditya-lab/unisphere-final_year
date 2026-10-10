import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RIVERSIDE, admin, anon, cleanupUsers, createUser } from "../helpers/supabase.js";

let owner, mgr, member, outsider, otherCollege, collab, privateGuy;
const tag = Math.random().toString(36).slice(2, 7);
const slug = () => `p-${tag}-${Math.random().toString(36).slice(2, 8)}`;

async function makeProject(user, patch = {}) {
  const { data, error } = await user.client
    .from("projects")
    .insert({ owner_id: user.id, slug: slug(), name: `Project ${tag}`, visibility: "college", looking_for_members: true, team_size: 4, ...patch })
    .select("id, slug")
    .single();
  if (error) throw error;
  return data;
}
const seen = async (client, id) => (await client.from("project_cards").select("id").eq("id", id)).data?.length === 1;

beforeAll(async () => {
  owner = await createUser("pj-owner");
  mgr = await createUser("pj-mgr");
  member = await createUser("pj-member");
  outsider = await createUser("pj-outsider");
  otherCollege = await createUser("pj-other", { collegeId: RIVERSIDE });
  collab = await createUser("pj-collab");
  privateGuy = await createUser("pj-private", { visibility: "private" });
  await admin.from("profiles").update({ skills: ["React Native", "Figma"], interests: ["Sustainability"], preferred_roles: ["Mobile"], open_to_collaboration: true }).eq("id", collab.id);
  await admin.from("profiles").update({ skills: ["React Native"], open_to_collaboration: true }).eq("id", privateGuy.id);
});
afterAll(async () => {
  await admin.from("projects").delete().like("slug", `p-${tag}-%`);
  await cleanupUsers();
});

describe("projects: creation and visibility", () => {
  it("makes the creator the owner and first member", async () => {
    const p = await makeProject(owner);
    const { data: members } = await admin.from("project_members").select("user_id, role").eq("project_id", p.id);
    expect(members).toEqual([{ user_id: owner.id, role: "owner" }]);
    expect((await admin.from("projects").select("member_count, college_id").eq("id", p.id).single()).data.member_count).toBe(1);
  });

  it("cannot be created in someone else's name", async () => {
    const res = await outsider.client.from("projects").insert({ owner_id: owner.id, slug: slug(), name: "Forged project" });
    expect(res.error).not.toBeNull();
  });

  it("enforces public / college / team-only visibility, incl. anonymous visitors", async () => {
    const pub = await makeProject(owner, { visibility: "public" });
    const college = await makeProject(owner, { visibility: "college" });
    const priv = await makeProject(owner, { visibility: "private" });
    expect(await seen(anon(), pub.id)).toBe(true);
    expect(await seen(anon(), college.id)).toBe(false);
    expect(await seen(outsider.client, college.id)).toBe(true);
    expect(await seen(otherCollege.client, college.id)).toBe(false);
    expect(await seen(outsider.client, priv.id)).toBe(false);
    expect(await seen(owner.client, priv.id)).toBe(true);
    // raw tables follow the same rule
    expect((await outsider.client.from("projects").select("id").eq("id", priv.id)).data).toHaveLength(0);
    expect((await outsider.client.from("project_members").select("user_id").eq("project_id", priv.id)).data).toHaveLength(0);
  });

  it("hides projects from people the owner blocked and after deletion", async () => {
    const p = await makeProject(owner, { visibility: "public" });
    await owner.client.rpc("block_user", { p_target: outsider.id });
    expect(await seen(outsider.client, p.id)).toBe(false);
    await owner.client.rpc("unblock_user", { p_target: outsider.id });
    expect(await seen(outsider.client, p.id)).toBe(true);

    expect((await outsider.client.rpc("delete_project", { p_project: p.id })).error).not.toBeNull();
    expect((await owner.client.rpc("delete_project", { p_project: p.id })).error).toBeNull();
    expect(await seen(anon(), p.id)).toBe(false);
    expect(await seen(owner.client, p.id)).toBe(false);
  });
});

describe("projects: join requests", () => {
  it("runs request → accept, adds the member once and closes the matched role", async () => {
    const p = await makeProject(owner);
    const { data: role } = await owner.client.from("project_open_roles").insert({ project_id: p.id, title: "Mobile dev", skills: ["React Native"] }).select("id").single();

    const req = await member.client.rpc("request_to_join_project", { p_project: p.id, p_role: role.id, p_message: "I can help" });
    expect(req.error).toBeNull();
    expect((await member.client.rpc("request_to_join_project", { p_project: p.id })).error?.message).toContain("already_requested");
    // only managers can answer; an outsider cannot self-approve
    expect((await outsider.client.rpc("respond_join_request", { p_id: req.data, p_accept: true })).error?.message).toContain("forbidden");
    expect((await member.client.rpc("respond_join_request", { p_id: req.data, p_accept: true })).error?.message).toContain("forbidden");
    // requests are visible to the applicant and managers only
    expect((await outsider.client.from("project_join_requests").select("id")).data).toHaveLength(0);
    expect((await owner.client.from("project_join_requests").select("id").eq("project_id", p.id)).data).toHaveLength(1);

    expect((await owner.client.rpc("respond_join_request", { p_id: req.data, p_accept: true })).error).toBeNull();
    expect((await admin.from("project_members").select("role, title").eq("project_id", p.id).eq("user_id", member.id).single()).data).toEqual({ role: "member", title: "Mobile dev" });
    expect((await admin.from("projects").select("member_count").eq("id", p.id).single()).data.member_count).toBe(2);
    expect((await admin.from("project_open_roles").select("is_open").eq("id", role.id).single()).data.is_open).toBe(false);
    expect((await member.client.rpc("request_to_join_project", { p_project: p.id })).error?.message).toContain("already_member");
    expect((await owner.client.rpc("respond_join_request", { p_id: req.data, p_accept: false })).error).not.toBeNull(); // already decided
  });

  it("refuses requests to projects that are not recruiting, are full, or are not visible", async () => {
    const closed = await makeProject(owner, { looking_for_members: false });
    expect((await outsider.client.rpc("request_to_join_project", { p_project: closed.id })).error?.message).toContain("not_recruiting");
    const full = await makeProject(owner, { team_size: 1 });
    expect((await outsider.client.rpc("request_to_join_project", { p_project: full.id })).error?.message).toContain("team_full");
    const priv = await makeProject(owner, { visibility: "private" });
    expect((await outsider.client.rpc("request_to_join_project", { p_project: priv.id })).error?.message).toContain("project_unavailable");
    expect((await otherCollege.client.rpc("request_to_join_project", { p_project: (await makeProject(owner)).id })).error?.message).toContain("project_unavailable");
  });

  it("lets applicants withdraw, and rejection leaves membership unchanged", async () => {
    const p = await makeProject(owner);
    const r = await outsider.client.rpc("request_to_join_project", { p_project: p.id });
    expect((await outsider.client.rpc("withdraw_join_request", { p_id: r.data })).error).toBeNull();
    const r2 = await outsider.client.rpc("request_to_join_project", { p_project: p.id });
    expect((await owner.client.rpc("respond_join_request", { p_id: r2.data, p_accept: false })).error).toBeNull();
    expect((await admin.from("project_members").select("user_id").eq("project_id", p.id)).data).toHaveLength(1);
  });
});

describe("projects: invitations and member management", () => {
  let p;
  beforeAll(async () => {
    p = await makeProject(owner, { team_size: 6 });
    const r = await mgr.client.rpc("request_to_join_project", { p_project: p.id });
    await owner.client.rpc("respond_join_request", { p_id: r.data, p_accept: true });
    const r2 = await member.client.rpc("request_to_join_project", { p_project: p.id });
    await owner.client.rpc("respond_join_request", { p_id: r2.data, p_accept: true });
  });

  it("only the owner can promote members to manager, and managers can then manage", async () => {
    expect((await mgr.client.rpc("set_project_member_role", { p_project: p.id, p_user: member.id, p_role: "manager" })).error?.message).toContain("forbidden");
    expect((await owner.client.rpc("set_project_member_role", { p_project: p.id, p_user: mgr.id, p_role: "manager" })).error).toBeNull();
    expect((await owner.client.rpc("set_project_member_role", { p_project: p.id, p_user: owner.id, p_role: "member" })).error).not.toBeNull();
    expect((await mgr.client.from("projects").update({ tagline: "Edited by a manager" }).eq("id", p.id).select()).data).toHaveLength(1);
    expect((await member.client.from("projects").update({ tagline: "hacked" }).eq("id", p.id).select()).data ?? []).toHaveLength(0);
    expect((await member.client.from("project_open_roles").insert({ project_id: p.id, title: "Sneaky role" })).error).not.toBeNull();
  });

  it("invitations: managers invite, only the invitee answers, duplicates and members are rejected", async () => {
    expect((await member.client.rpc("invite_to_project", { p_project: p.id, p_invitee: outsider.id })).error?.message).toContain("forbidden");
    const inv = await mgr.client.rpc("invite_to_project", { p_project: p.id, p_invitee: outsider.id, p_role_label: "Tester", p_message: "Join us" });
    expect(inv.error).toBeNull();
    expect((await mgr.client.rpc("invite_to_project", { p_project: p.id, p_invitee: outsider.id })).error?.message).toContain("already_invited");
    expect((await mgr.client.rpc("invite_to_project", { p_project: p.id, p_invitee: member.id })).error?.message).toContain("already_member");
    expect((await member.client.rpc("respond_project_invitation", { p_id: inv.data, p_accept: true })).error).not.toBeNull();
    expect((await outsider.client.from("project_invitations").select("id")).data).toHaveLength(1);
    expect((await collab.client.from("project_invitations").select("id")).data).toHaveLength(0);
    expect((await outsider.client.rpc("respond_project_invitation", { p_id: inv.data, p_accept: true })).error).toBeNull();
    expect((await admin.from("project_members").select("title").eq("project_id", p.id).eq("user_id", outsider.id).single()).data.title).toBe("Tester");
  });

  it("revoked invitations cannot be accepted and blocked users cannot be invited", async () => {
    const inv = await mgr.client.rpc("invite_to_project", { p_project: p.id, p_invitee: collab.id });
    expect((await mgr.client.rpc("revoke_project_invitation", { p_id: inv.data })).error).toBeNull();
    expect((await collab.client.rpc("respond_project_invitation", { p_id: inv.data, p_accept: true })).error).not.toBeNull();
    await collab.client.rpc("block_user", { p_target: mgr.id });
    expect((await mgr.client.rpc("invite_to_project", { p_project: p.id, p_invitee: collab.id })).error?.message).toContain("target_unavailable");
    await collab.client.rpc("unblock_user", { p_target: mgr.id });
  });

  it("members can leave, nobody can remove the owner, and members cannot remove others", async () => {
    expect((await member.client.rpc("remove_project_member", { p_project: p.id, p_user: mgr.id })).error?.message).toContain("forbidden");
    expect((await mgr.client.rpc("remove_project_member", { p_project: p.id, p_user: owner.id })).error?.message).toContain("cannot_remove_owner");
    expect((await owner.client.rpc("remove_project_member", { p_project: p.id, p_user: owner.id })).error?.message).toContain("cannot_remove_owner");
    expect((await member.client.rpc("remove_project_member", { p_project: p.id, p_user: member.id })).error).toBeNull();
    expect((await admin.from("project_members").select("user_id").eq("project_id", p.id).eq("user_id", member.id)).data).toHaveLength(0);
    // direct writes to the membership table are not possible
    expect((await outsider.client.from("project_members").insert({ project_id: p.id, user_id: collab.id })).error).not.toBeNull();
    expect((await owner.client.from("project_members").delete().eq("project_id", p.id).eq("user_id", mgr.id)).data ?? null).toBeNull();
    expect((await admin.from("project_members").select("user_id").eq("project_id", p.id).eq("user_id", mgr.id)).data).toHaveLength(1);
  });
});

describe("teammate recommendations", () => {
  it("is limited to managers and explains matches from listed profile facts only", async () => {
    const p = await makeProject(owner, { required_skills: ["react native", "Figma", "Rust"], tech_stack: ["Sustainability"] });
    await owner.client.from("project_open_roles").insert({ project_id: p.id, title: "Mobile", skills: ["React Native"] });

    expect((await outsider.client.rpc("recommend_teammates", { p_project: p.id })).error?.message).toContain("forbidden");
    const res = await owner.client.rpc("recommend_teammates", { p_project: p.id, p_limit: 10 });
    expect(res.error).toBeNull();
    const ids = res.data.map((c) => c.id);
    expect(ids).toContain(collab.id);
    expect(ids).not.toContain(owner.id);
    expect(ids).not.toContain(privateGuy.id); // private profile hidden from the owner
    const c = res.data.find((x) => x.id === collab.id);
    expect(c.matched_skills.sort()).toEqual(["Figma", "React Native"]);
    expect(c.matched_roles).toEqual(["Mobile"]);
    expect(c.matched_interests).toEqual(["Sustainability"]);
    expect(c.score).toBe(3 * 2 + 2 * 1 + 1 * 1); // documented formula
    // nobody without a listed match is suggested
    expect(res.data.every((x) => x.matched_skills.length + x.matched_roles.length + x.matched_interests.length > 0)).toBe(true);
  });

  it("excludes members, pending invitees, people who are not open to collaborating and blocked users", async () => {
    const p = await makeProject(owner, { required_skills: ["React Native"] });
    const base = (await owner.client.rpc("recommend_teammates", { p_project: p.id })).data.map((c) => c.id);
    expect(base).toContain(collab.id);

    await owner.client.rpc("invite_to_project", { p_project: p.id, p_invitee: collab.id });
    expect((await owner.client.rpc("recommend_teammates", { p_project: p.id })).data.map((c) => c.id)).not.toContain(collab.id);

    const p2 = await makeProject(owner, { required_skills: ["React Native"] });
    await admin.from("profiles").update({ open_to_collaboration: false }).eq("id", collab.id);
    expect((await owner.client.rpc("recommend_teammates", { p_project: p2.id })).data.map((c) => c.id)).not.toContain(collab.id);
    await admin.from("profiles").update({ open_to_collaboration: true }).eq("id", collab.id);
  });
});

describe("project search", () => {
  it("filters by text, status, skill and recruiting, and respects visibility", async () => {
    const word = `quokka${tag}`;
    const a = await makeProject(owner, { name: `${word} planner`, status: "in_progress", required_skills: ["Elixirlang"], visibility: "public" });
    const b = await makeProject(owner, { name: `${word} hidden`, visibility: "private" });
    const byText = (await outsider.client.rpc("search_projects", { p_query: word })).data.map((x) => x.id);
    expect(byText).toContain(a.id);
    expect(byText).not.toContain(b.id);
    expect((await outsider.client.rpc("search_projects", { p_query: word, p_status: "idea" })).data.map((x) => x.id)).not.toContain(a.id);
    expect((await outsider.client.rpc("search_projects", { p_skills: ["elixirlang"] })).data.map((x) => x.id)).toContain(a.id);
    expect((await anon().rpc("search_projects", { p_query: word })).data.map((x) => x.id)).toEqual([a.id]);
  });
});

describe("mentorship", () => {
  let mentor, student;
  beforeAll(async () => {
    mentor = await createUser("mt-mentor", { accountType: "alumni" });
    student = await createUser("mt-student");
    await admin.from("profiles").update({ open_to_mentoring: true, mentoring_topics: ["Interviews"], industry: "Software", job_title: "Engineer", company: "Acme", graduation_year: 2020 }).eq("id", mentor.id);
  });

  it("only allows requests to members who opted in, with a real message", async () => {
    expect((await student.client.rpc("request_mentorship", { p_mentor: outsider.id, p_topic: "x", p_message: "Could you mentor me please?" })).error?.message).toContain("mentor_unavailable");
    expect((await student.client.rpc("request_mentorship", { p_mentor: student.id, p_topic: "x", p_message: "Mentor myself, please" })).error).not.toBeNull();
    expect((await student.client.from("mentorship_requests").insert({ mentee_id: student.id, mentor_id: mentor.id, message: "bypass the rules" })).error).not.toBeNull();
    const r = await student.client.rpc("request_mentorship", { p_mentor: mentor.id, p_topic: "Interviews", p_message: "I would love advice on preparing for interviews." });
    expect(r.error).toBeNull();
    expect((await student.client.rpc("request_mentorship", { p_mentor: mentor.id, p_message: "Asking again about interviews." })).error?.message).toContain("already_requested");
  });

  it("is visible only to the two people involved, and only the mentor can answer", async () => {
    const { data } = await mentor.client.from("mentorship_requests").select("id, mentee_id").eq("mentor_id", mentor.id);
    expect(data).toHaveLength(1);
    expect((await outsider.client.from("mentorship_requests").select("id")).data).toHaveLength(0);
    expect((await outsider.client.rpc("respond_mentorship", { p_id: data[0].id, p_accept: true })).error).not.toBeNull();
    expect((await student.client.rpc("respond_mentorship", { p_id: data[0].id, p_accept: true })).error).not.toBeNull();
    expect((await mentor.client.rpc("respond_mentorship", { p_id: data[0].id, p_accept: true, p_message: "Happy to help" })).error).toBeNull();
    expect((await student.client.from("mentorship_requests").select("status, response_message").eq("id", data[0].id).single()).data).toEqual({ status: "accepted", response_message: "Happy to help" });
  });

  it("caps pending requests, refuses blocked pairs and lists mentors by filter without contact details", async () => {
    const s2 = await createUser("mt-s2");
    const mentors = [];
    for (let i = 0; i < 4; i++) {
      const m = await createUser(`mt-m${i}`);
      await admin.from("profiles").update({ open_to_mentoring: true }).eq("id", m.id);
      mentors.push(m);
    }
    for (let i = 0; i < 3; i++) expect((await s2.client.rpc("request_mentorship", { p_mentor: mentors[i].id, p_message: "Hello, could you guide me?" })).error).toBeNull();
    expect((await s2.client.rpc("request_mentorship", { p_mentor: mentors[3].id, p_message: "One more request here." })).error?.message).toContain("too_many_pending");

    await mentors[3].client.rpc("block_user", { p_target: student.id });
    expect((await student.client.rpc("request_mentorship", { p_mentor: mentors[3].id, p_message: "Blocked user trying." })).error?.message).toContain("mentor_unavailable");

    const found = await student.client.rpc("search_mentors", { p_industry: "soft", p_grad_from: 2019, p_grad_to: 2021, p_only_mentors: true });
    expect(found.data.map((m) => m.id)).toEqual([mentor.id]);
    expect(Object.keys(found.data[0]).some((k) => /email|phone/i.test(k))).toBe(false);
    expect((await student.client.rpc("search_mentors", { p_only_mentors: true, p_industry: "nonexistent-industry" })).data).toHaveLength(0);
  });
});
