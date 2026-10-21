import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GREENFIELD, RIVERSIDE, admin, cleanupUsers, createUser, grantRoleDirect } from "../helpers/supabase.js";

/** Administration: scoped permissions, moderation, appeals, analytics and deletion, with real sessions. */

let member, member2, reporter, mod, otherMod, cadmin, gadmin, outsiderMod, outsiderMember, support;
const tag = Math.random().toString(36).slice(2, 7);
const slug = (p) => `${p}-${tag}-${Math.random().toString(36).slice(2, 7)}`;
const rpc = (u, fn, args) => u.client.rpc(fn, args);
const statusOf = async (u) => (await admin.from("profiles").select("status").eq("id", u.id).single()).data.status;

async function makePost(author, body = "A questionable post") {
  const { data, error } = await author.client.from("posts").insert({ author_id: author.id, slug: slug("p"), title: `Post ${tag}`, body, visibility: "public" }).select("id, slug").single();
  expect(error).toBeNull();
  return data;
}
async function report(by, targetType, targetId, category = "spam") {
  const { data, error } = await rpc(by, "submit_report", { p_target_type: targetType, p_target_id: targetId, p_category: category, p_details: "details" });
  expect(error, JSON.stringify(error)).toBeNull();
  return data;
}

beforeAll(async () => {
  member = await createUser("p5-member");
  member2 = await createUser("p5-member2");
  reporter = await createUser("p5-reporter");
  mod = await createUser("p5-mod");
  otherMod = await createUser("p5-mod2");
  cadmin = await createUser("p5-cadmin");
  gadmin = await createUser("p5-gadmin");
  outsiderMod = await createUser("p5-outmod", { collegeId: RIVERSIDE });
  outsiderMember = await createUser("p5-outmember", { collegeId: RIVERSIDE });
  support = await createUser("p5-support");
  await grantRoleDirect(mod.id, "moderator", GREENFIELD);
  await grantRoleDirect(otherMod.id, "moderator", GREENFIELD);
  await grantRoleDirect(cadmin.id, "college_admin", GREENFIELD);
  await grantRoleDirect(gadmin.id, "global_admin");
  await grantRoleDirect(outsiderMod.id, "moderator", RIVERSIDE);
  await grantRoleDirect(support.id, "support_agent");
});
afterAll(async () => {
  await admin.from("posts").delete().like("slug", `%-${tag}-%`);
  await cleanupUsers();
});

describe("report queue and scoping", () => {
  it("shows reports only to staff of the report's own college", async () => {
    const post = await makePost(member);
    const id = await report(reporter, "post", post.id, "harassment");

    const mine = await rpc(mod, "list_reports", { p_status: "open", p_limit: 100 });
    expect(mine.error).toBeNull();
    expect(mine.data.map((r) => r.id)).toContain(id);
    expect(mine.data.find((r) => r.id === id)).toMatchObject({ severity: "medium", category: "harassment" });

    expect((await rpc(outsiderMod, "list_reports", { p_status: "all", p_limit: 100 })).data.map((r) => r.id)).not.toContain(id);
    expect((await rpc(member2, "list_reports", { p_status: "all" })).data).toEqual([]);
    expect((await rpc(gadmin, "list_reports", { p_status: "all", p_limit: 100 })).data.map((r) => r.id)).toContain(id);

    expect((await rpc(outsiderMod, "get_report", { p_id: id })).error?.message).toMatch(/forbidden/);
    const detail = await rpc(mod, "get_report", { p_id: id });
    expect(detail.data.report.snapshot.body).toBe("A questionable post");
    expect(detail.data.report.reporter_id).toBeUndefined(); // reporters stay confidential even from the payload
  });

  it("does not let plain members or support agents resolve reports", async () => {
    const post = await makePost(member);
    const id = await report(reporter, "post", post.id);
    for (const u of [member2, support, outsiderMod]) {
      expect((await rpc(u, "resolve_report", { p_id: id, p_action: "dismiss" })).error?.message, u.username).toMatch(/forbidden/);
    }
    expect((await admin.from("reports").select("status").eq("id", id).single()).data.status).toBe("open");
  });
});

describe("resolving reports", () => {
  it("removes content, notifies the author and the reporter, and hides the post", async () => {
    const post = await makePost(member, "Remove me");
    const id = await report(reporter, "post", post.id);
    await report(member2, "post", post.id, "hate"); // a second report on the same post is closed too

    expect((await rpc(mod, "resolve_report", { p_id: id, p_action: "remove_content" })).error?.message).toMatch(/reason_required/);
    const res = await rpc(mod, "resolve_report", { p_id: id, p_action: "remove_content", p_reason: "Breaks guideline 2" });
    expect(res.error, JSON.stringify(res.error)).toBeNull();

    const { data: p } = await admin.from("posts").select("status, removed_by, removed_reason").eq("id", post.id).single();
    expect(p).toMatchObject({ status: "removed", removed_by: mod.id, removed_reason: "Breaks guideline 2" });
    expect((await admin.from("reports").select("status").eq("target_id", post.id)).data.map((r) => r.status)).toEqual(["resolved", "resolved"]);

    const { data: ownerNotes } = await admin.from("notifications").select("type, data").eq("user_id", member.id).eq("type", "moderation_content_removed");
    expect(ownerNotes).toHaveLength(1);
    expect(ownerNotes[0].data.reason).toBe("Breaks guideline 2");
    expect((await admin.from("notifications").select("type").eq("user_id", reporter.id).eq("type", "moderation_report_outcome")).data).toHaveLength(1);
    // audit trail + moderation history
    expect((await admin.from("audit_logs").select("action").eq("actor_id", mod.id)).data.map((a) => a.action)).toEqual(expect.arrayContaining(["moderation.remove_content", "report.resolved"]));
    // a second resolution is rejected
    expect((await rpc(mod, "resolve_report", { p_id: id, p_action: "dismiss" })).error?.message).toMatch(/already_resolved/);
  });

  it("dismisses without touching the content", async () => {
    const post = await makePost(member);
    const id = await report(reporter, "post", post.id);
    expect((await rpc(mod, "resolve_report", { p_id: id, p_action: "dismiss" })).error).toBeNull();
    expect((await admin.from("posts").select("status").eq("id", post.id).single()).data.status).toBe("published");
    expect((await admin.from("reports").select("status").eq("id", id).single()).data.status).toBe("dismissed");
  });

  it("applies the permission each action needs (moderators can warn and restrict, but not suspend)", async () => {
    const post = await makePost(member2);
    const id = await report(reporter, "post", post.id);
    expect((await rpc(mod, "resolve_report", { p_id: id, p_action: "suspend", p_reason: "x" })).error?.message).toMatch(/forbidden/);
    expect((await rpc(mod, "resolve_report", { p_id: id, p_action: "warn", p_reason: "Please keep it civil" })).error).toBeNull();
    expect((await admin.from("notifications").select("type").eq("user_id", member2.id).eq("type", "moderation_warning")).data).toHaveLength(1);
    expect(await statusOf(member2)).toBe("active");
  });

  it("will not let staff act on themselves, on administrators, or on their own reports", async () => {
    const selfPost = await makePost(mod);
    const selfReport = await report(reporter, "post", selfPost.id);
    expect((await rpc(mod, "resolve_report", { p_id: selfReport, p_action: "warn", p_reason: "x" })).error?.message).toMatch(/cannot_act_on_self/);

    const adminPost = await makePost(cadmin);
    const adminReport = await report(reporter, "post", adminPost.id);
    expect((await rpc(mod, "resolve_report", { p_id: adminReport, p_action: "remove_content", p_reason: "x" })).error?.message).toMatch(/protected_account/);
    expect((await rpc(gadmin, "resolve_report", { p_id: adminReport, p_action: "warn", p_reason: "Admins follow rules too" })).error).toBeNull();

    expect((await rpc(mod, "moderate_user", { p_user: gadmin.id, p_action: "suspend", p_reason: "x" })).error?.message).toMatch(/forbidden|protected_account/);
    expect((await rpc(cadmin, "moderate_user", { p_user: gadmin.id, p_action: "restrict", p_reason: "x" })).error?.message).toMatch(/protected_account/);
  });

  it("claims and releases reports", async () => {
    const post = await makePost(member);
    const id = await report(reporter, "post", post.id);
    expect((await rpc(mod, "assign_report", { p_id: id, p_assign: true })).error).toBeNull();
    expect((await admin.from("reports").select("status, assigned_to").eq("id", id).single()).data).toMatchObject({ status: "in_review", assigned_to: mod.id });
    expect((await rpc(mod, "assign_report", { p_id: id, p_assign: false })).error).toBeNull();
    expect((await admin.from("reports").select("status, assigned_to").eq("id", id).single()).data).toMatchObject({ status: "open", assigned_to: null });
    expect((await rpc(mod, "add_report_note", { p_id: id, p_note: "Looks like a repeat offender" })).error).toBeNull();
    // internal notes are invisible to the member they concern
    const own = await member.client.from("moderation_actions").select("action").eq("target_user_id", member.id);
    expect(own.data.map((a) => a.action)).not.toContain("note");
  });
});

describe("suspension, appeals and reinstatement", () => {
  let target, actionId;
  it("restricts and suspends an account; a suspended member can still read the reason and appeal", async () => {
    target = await createUser("p5-target");
    expect((await rpc(cadmin, "moderate_user", { p_user: target.id, p_action: "suspend", p_reason: "Repeated harassment" })).error).toBeNull();
    expect(await statusOf(target)).toBe("suspended");

    // cannot post any more
    const blocked = await target.client.from("posts").insert({ author_id: target.id, slug: slug("s"), body: "still here?", visibility: "public" });
    expect(blocked.error).not.toBeNull();

    const { data: acts } = await target.client.from("moderation_actions").select("id, action, reason").eq("target_user_id", target.id);
    expect(acts).toHaveLength(1);
    expect(acts[0]).toMatchObject({ action: "suspend", reason: "Repeated harassment" });
    actionId = acts[0].id;
  });

  it("validates appeals: length, ownership, one per decision", async () => {
    expect((await rpc(target, "submit_appeal", { p_message: "short" })).error?.message).toMatch(/invalid_message/);
    expect((await rpc(member, "submit_appeal", { p_message: "I want to appeal something please", p_action_id: actionId })).error?.message).toMatch(/nothing_to_appeal/);
    const ok = await rpc(target, "submit_appeal", { p_message: "I was provoked and I will behave from now on." });
    expect(ok.error, JSON.stringify(ok.error)).toBeNull();
    expect((await rpc(target, "submit_appeal", { p_message: "Appealing again with another message." })).error?.message).toMatch(/already_appealed/);
  });

  it("routes appeals to staff of the same college and applies the decision", async () => {
    expect((await rpc(outsiderMod, "list_appeals", { p_status: "pending" })).data).toEqual([]);
    const list = await rpc(otherMod, "list_appeals", { p_status: "pending" });
    const appeal = list.data.find((a) => a.user_id === target.id);
    expect(appeal).toBeTruthy();
    expect(appeal.action).toBe("suspend");

    // the target cannot review their own appeal; a member cannot review at all
    expect((await rpc(target, "review_appeal", { p_id: appeal.id, p_decision: "upheld", p_note: "free me" })).error?.message).toMatch(/forbidden/);
    expect((await rpc(otherMod, "review_appeal", { p_id: appeal.id, p_decision: "denied", p_note: null })).error?.message).toMatch(/reason_required/);

    expect((await rpc(otherMod, "review_appeal", { p_id: appeal.id, p_decision: "upheld", p_note: "First offence; apology accepted" })).error).toBeNull();
    expect(await statusOf(target)).toBe("active");
    const notes = (await admin.from("notifications").select("type, data").eq("user_id", target.id).eq("type", "moderation_appeal_decision")).data;
    expect(notes).toHaveLength(1);
    expect(notes[0].data.upheld).toBe(true);
    expect((await rpc(otherMod, "review_appeal", { p_id: appeal.id, p_decision: "denied", p_note: "x" })).error?.message).toMatch(/already_decided/);
  });

  it("separates the decision maker from the reviewer (administrators excepted)", async () => {
    const t2 = await createUser("p5-target2");
    expect((await rpc(mod, "moderate_user", { p_user: t2.id, p_action: "restrict", p_reason: "Spamming" })).error).toBeNull();
    expect(await statusOf(t2)).toBe("restricted");
    expect((await rpc(t2, "submit_appeal", { p_message: "I did not spam; those were announcements." })).error).toBeNull();
    const appeal = (await rpc(mod, "list_appeals", { p_status: "pending" })).data.find((a) => a.user_id === t2.id);
    expect((await rpc(mod, "review_appeal", { p_id: appeal.id, p_decision: "denied", p_note: "Reviewed" })).error?.message).toMatch(/cannot_review_own_decision/);
    expect((await rpc(gadmin, "review_appeal", { p_id: appeal.id, p_decision: "denied", p_note: "Decision stands" })).error).toBeNull();
    expect(await statusOf(t2)).toBe("restricted");
  });

  it("reinstating directly closes pending appeals", async () => {
    const t3 = await createUser("p5-target3");
    await rpc(cadmin, "moderate_user", { p_user: t3.id, p_action: "suspend", p_reason: "Test" });
    await rpc(t3, "submit_appeal", { p_message: "Please review my suspension, thank you." });
    expect((await rpc(cadmin, "moderate_user", { p_user: t3.id, p_action: "reinstate", p_reason: "Resolved offline" })).error).toBeNull();
    expect(await statusOf(t3)).toBe("active");
    expect((await admin.from("appeals").select("status").eq("user_id", t3.id).single()).data.status).toBe("upheld");
  });

  it("restores removed posts only through a permission-checked path", async () => {
    const post = await makePost(member, "Restore me");
    expect((await rpc(mod, "moderate_content", { p_type: "post", p_id: post.id, p_action: "remove", p_reason: "Mistake" })).error).toBeNull();
    // the author cannot un-remove their own post
    await member.client.from("posts").update({ status: "published" }).eq("id", post.id);
    expect((await admin.from("posts").select("status").eq("id", post.id).single()).data.status).toBe("removed");
    // staff in another college cannot either
    expect((await rpc(outsiderMod, "moderate_content", { p_type: "post", p_id: post.id, p_action: "restore", p_reason: "x" })).error?.message).toMatch(/forbidden/);
    expect((await rpc(mod, "moderate_content", { p_type: "post", p_id: post.id, p_action: "restore", p_reason: "Removed in error" })).error).toBeNull();
    expect((await admin.from("posts").select("status, removed_reason").eq("id", post.id).single()).data).toMatchObject({ status: "published", removed_reason: null });
  });
});

describe("user management", () => {
  it("lists users with email only to staff, scoped to their college", async () => {
    const asCollegeAdmin = await rpc(cadmin, "admin_list_users", { p_q: "p5-member" });
    expect(asCollegeAdmin.error).toBeNull();
    expect(asCollegeAdmin.data.length).toBeGreaterThan(0);
    expect(asCollegeAdmin.data.every((u) => u.college_id === GREENFIELD)).toBe(true);
    expect(asCollegeAdmin.data[0].email).toContain("@");
    expect((await rpc(cadmin, "admin_list_users", { p_q: "p5-outmember" })).data).toEqual([]);
    expect((await rpc(gadmin, "admin_list_users", { p_q: "p5-outmember" })).data).toHaveLength(1);
    expect((await rpc(member, "admin_list_users", {})).data).toEqual([]);
    expect((await rpc(mod, "admin_list_users", {})).data).toEqual([]); // moderators do not browse accounts
    expect((await rpc(cadmin, "admin_user_detail", { p_id: outsiderMember.id })).error?.message).toMatch(/forbidden/);
    const detail = await rpc(cadmin, "admin_user_detail", { p_id: member.id });
    expect(detail.data.counts.posts).toBeGreaterThan(0);
    expect(detail.data.actions.length).toBeGreaterThan(0);
  });

  it("limits who can see and grant roles", async () => {
    expect((await rpc(member, "list_role_assignments", {})).data).toEqual([]);
    const forCollegeAdmin = (await rpc(cadmin, "list_role_assignments", {})).data;
    expect(forCollegeAdmin.every((r) => r.college_id === GREENFIELD || r.role === "global_admin")).toBeTruthy();
    expect(forCollegeAdmin.some((r) => r.role === "global_admin")).toBe(false);
    // a college admin may appoint moderators in their college but never administrators
    expect((await rpc(cadmin, "grant_role", { p_user: member2.id, p_role: "moderator", p_college: GREENFIELD })).error).toBeNull();
    expect((await rpc(cadmin, "grant_role", { p_user: member2.id, p_role: "college_admin", p_college: GREENFIELD })).error?.message).toMatch(/forbidden/);
    expect((await rpc(cadmin, "grant_role", { p_user: outsiderMember.id, p_role: "moderator", p_college: GREENFIELD })).error).not.toBeNull();
    const all = (await rpc(gadmin, "list_role_assignments", {})).data;
    expect(all.some((r) => r.user_id === gadmin.id && r.role === "global_admin")).toBe(true);
  });
});

describe("content oversight", () => {
  it("lists posts, communities and events to the staff who manage them", async () => {
    const post = await makePost(member2, "Oversight needle");
    const asMod = await rpc(mod, "admin_list_content", { p_kind: "post", p_q: "needle" });
    expect(asMod.error).toBeNull();
    expect(asMod.data.map((r) => r.id)).toContain(post.id);
    expect((await rpc(outsiderMod, "admin_list_content", { p_kind: "post", p_q: "needle" })).data).toEqual([]);
    // moderators don't manage communities or events
    expect((await rpc(mod, "admin_list_content", { p_kind: "community" })).data).toEqual([]);

    const { data: community, error: communityError } = await member.client.from("communities").insert({ name: `Oversight club ${tag}`, slug: slug("club"), created_by: member.id, kind: "club", visibility: "college", join_policy: "open" }).select("id, slug").single();
    expect(communityError).toBeNull();
    const listed = await rpc(cadmin, "admin_list_content", { p_kind: "community", p_q: tag });
    expect(listed.data.map((r) => r.id)).toContain(community.id);
    expect((await rpc(cadmin, "admin_set_listing_removed", { p_kind: "community", p_id: community.id, p_removed: true, p_reason: null })).error?.message).toMatch(/reason_required/);
    expect((await rpc(cadmin, "admin_set_listing_removed", { p_kind: "community", p_id: community.id, p_removed: true, p_reason: "Impersonates the college" })).error).toBeNull();
    expect((await admin.from("communities").select("deleted_at").eq("id", community.id).single()).data.deleted_at).not.toBeNull();
    expect((await rpc(mod, "admin_set_listing_removed", { p_kind: "community", p_id: community.id, p_removed: false, p_reason: "x" })).error?.message).toMatch(/forbidden/);
    await admin.from("communities").delete().eq("id", community.id);
  });
});

describe("analytics", () => {
  it("scopes numbers to the viewer's college and rejects bad ranges", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const own = await rpc(cadmin, "admin_overview", { p_college: GREENFIELD, p_from: today, p_to: today });
    expect(own.error, JSON.stringify(own.error)).toBeNull();
    expect(own.data.members).toBeGreaterThan(0);
    expect(own.data.posts_period).toBeGreaterThan(0);
    expect((await rpc(cadmin, "admin_overview", { p_college: RIVERSIDE })).error?.message).toMatch(/forbidden/);
    expect((await rpc(cadmin, "admin_overview", {})).error?.message).toMatch(/forbidden/); // platform-wide needs a platform-wide role
    expect((await rpc(mod, "admin_overview", { p_college: GREENFIELD })).error?.message).toMatch(/forbidden/);
    const global = await rpc(gadmin, "admin_overview", {});
    expect(global.error).toBeNull();
    expect(global.data.members).toBeGreaterThanOrEqual(own.data.members);
    expect((await rpc(gadmin, "admin_overview", { p_from: "2026-01-02", p_to: "2026-01-01" })).error?.message).toMatch(/invalid_range/);

    const series = await rpc(cadmin, "admin_timeseries", { p_metric: "posts", p_college: GREENFIELD, p_from: today, p_to: today });
    expect(series.error).toBeNull();
    expect(series.data).toHaveLength(1);
    expect(series.data[0].value).toBeGreaterThan(0);
    expect((await rpc(cadmin, "admin_timeseries", { p_metric: "bogus", p_college: GREENFIELD })).error?.message).toMatch(/invalid_metric/);
  });

  it("restricts the AI overview to staff with ai.view", async () => {
    expect((await rpc(cadmin, "admin_ai_overview", {})).error?.message).toMatch(/forbidden/);
    const res = await rpc(gadmin, "admin_ai_overview", { p_days: 7 });
    expect(res.error, JSON.stringify(res.error)).toBeNull();
    expect(res.data).toHaveProperty("by_task");
  });
});

describe("settings, audit and deletion", () => {
  it("lets only the right staff change settings and flags, and records it", async () => {
    expect((await rpc(cadmin, "set_system_setting", { p_key: "support_email", p_value: "x@y.z" })).error?.message).toMatch(/forbidden/);
    expect((await rpc(cadmin, "set_feature_flag", { p_key: "events", p_enabled: false })).error?.message).toMatch(/forbidden/);
    expect((await rpc(gadmin, "set_feature_flag", { p_key: "events", p_enabled: false })).error).toBeNull();
    expect((await rpc(gadmin, "set_feature_flag", { p_key: "events", p_enabled: true })).error).toBeNull();
    const { data } = await rpc(gadmin, "set_feature_flag", { p_key: "no_such_flag", p_enabled: true });
    expect(data ?? null).toBeNull();
    const log = await gadmin.client.from("audit_logs").select("action, metadata").eq("action", "flag.updated").eq("target_id", "events");
    expect(log.data.length).toBeGreaterThanOrEqual(2);
  });

  it("shows audit entries only to staff with audit.view, and in their own college", async () => {
    expect((await member.client.from("audit_logs").select("id")).data).toEqual([]);
    expect((await mod.client.from("audit_logs").select("id")).data).toEqual([]);
    const own = await cadmin.client.from("audit_logs").select("college_id, action").limit(200);
    expect(own.data.length).toBeGreaterThan(0);
    expect(own.data.every((r) => r.college_id === GREENFIELD)).toBe(true);
    // append-only, even for the highest role
    const upd = await gadmin.client.from("audit_logs").update({ action: "tampered" }).eq("action", "flag.updated").select();
    expect(upd.data ?? []).toEqual([]);
  });

  it("reviews deletion requests and keeps administrators out of the erasure queue", async () => {
    const leaving = await createUser("p5-leaving");
    // Members no longer write this table themselves: the server files the request after re-checking their password.
    await admin.rpc("request_account_deletion_for", { p_user: leaving.id, p_reason: "Graduating", p_erase_messages: false });
    expect((await rpc(support, "admin_list_deletions", {})).data).toEqual([]);
    const list = await rpc(cadmin, "admin_list_deletions", { p_status: "pending" });
    const req = list.data.find((r) => r.user_id === leaving.id);
    expect(req).toBeTruthy();
    expect((await rpc(mod, "review_deletion_request", { p_id: req.id, p_decision: "approve" })).error?.message).toMatch(/forbidden/);
    const approved = await rpc(cadmin, "review_deletion_request", { p_id: req.id, p_decision: "approve" });
    expect(approved.error, JSON.stringify(approved.error)).toBeNull();
    expect((await admin.from("account_deletion_requests").select("status").eq("id", req.id).single()).data.status).toBe("processing");

    // an administrator who requested deletion is never picked up by the automatic worker
    await admin.from("account_deletion_requests").insert({ user_id: cadmin.id, scheduled_for: new Date(Date.now() - 1000).toISOString() });
    const { data: claimed } = await admin.rpc("claim_due_deletions", { p_limit: 50 });
    expect(claimed.map((c) => c.user_id)).toContain(leaving.id);
    expect(claimed.map((c) => c.user_id)).not.toContain(cadmin.id);
    await admin.from("account_deletion_requests").delete().eq("user_id", cadmin.id);
  });
});
