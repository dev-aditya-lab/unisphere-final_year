import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  GREENFIELD,
  RIVERSIDE,
  admin,
  anon,
  cleanupUsers,
  createUser,
  grantRoleDirect,
} from "../helpers/supabase.js";

/**
 * Row Level Security and RBAC, exercised with real JWTs for several users and roles.
 * Every "cannot" below is an attempted attack that must be refused by the database itself.
 */

let alice, bob, carol, dave, globalAdmin, collegeAdmin, verifier, riversideStaff;

beforeAll(async () => {
  alice = await createUser("alice"); // Greenfield student, college-visible profile
  bob = await createUser("bob"); // Greenfield student
  carol = await createUser("carol", { collegeId: RIVERSIDE }); // other college
  dave = await createUser("dave", { visibility: "private" });
  globalAdmin = await createUser("gadmin");
  collegeAdmin = await createUser("cadmin");
  verifier = await createUser("verifier");
  riversideStaff = await createUser("rstaff", { collegeId: RIVERSIDE });
  await grantRoleDirect(globalAdmin.id, "global_admin");
  await grantRoleDirect(collegeAdmin.id, "college_admin", GREENFIELD);
  await grantRoleDirect(verifier.id, "verification_staff", GREENFIELD);
  await grantRoleDirect(riversideStaff.id, "verification_staff", RIVERSIDE);
});

afterAll(async () => {
  await cleanupUsers();
});

describe("profiles", () => {
  it("creates a profile for every new auth user with safe defaults", async () => {
    const { data } = await admin.from("profiles").select("status, verification_status, visibility, show_class").eq("id", alice.id).single();
    expect(data).toMatchObject({ status: "active", verification_status: "unverified", visibility: "college", show_class: false });
  });

  it("ignores privileged values smuggled in sign-up metadata", async () => {
    const mallory = await createUser("mallory", { accountType: "global_admin" });
    const { data: profile } = await admin.from("profiles").select("account_type").eq("id", mallory.id).single();
    expect(profile.account_type).toBe("student");
    const { data: roles } = await admin.from("user_roles").select("id").eq("user_id", mallory.id);
    expect(roles).toHaveLength(0);
  });

  it("lets users edit their own profile", async () => {
    const { error } = await alice.client.from("profiles").update({ bio: "Hello campus" }).eq("id", alice.id);
    expect(error).toBeNull();
    const { data } = await admin.from("profiles").select("bio").eq("id", alice.id).single();
    expect(data.bio).toBe("Hello campus");
  });

  it.each([["status", "suspended"], ["verification_status", "verified"], ["connection_count", 999], ["restricted_until", "2099-01-01"]])(
    "refuses to let a user write protected column %s",
    async (column, value) => {
      const { error } = await alice.client.from("profiles").update({ [column]: value }).eq("id", alice.id);
      expect(error).not.toBeNull();
      expect(error.code).toBe("42501");
    },
  );

  it("cannot update someone else's profile", async () => {
    const { data } = await bob.client.from("profiles").update({ bio: "hacked" }).eq("id", alice.id).select();
    expect(data ?? []).toHaveLength(0);
    const { data: row } = await admin.from("profiles").select("bio").eq("id", alice.id).single();
    expect(row.bio).not.toBe("hacked");
  });

  it("enforces profile visibility for college, other-college, anonymous and private profiles", async () => {
    // alice: visibility = college
    expect((await bob.client.from("profiles").select("id").eq("id", alice.id)).data).toHaveLength(1);
    expect((await carol.client.from("profiles").select("id").eq("id", alice.id)).data).toHaveLength(0);
    expect((await anon().from("profiles").select("id").eq("id", alice.id)).data).toHaveLength(0);
    // dave: private
    expect((await bob.client.from("profiles").select("id").eq("id", dave.id)).data).toHaveLength(0);
    expect((await dave.client.from("profiles").select("id").eq("id", dave.id)).data).toHaveLength(1);

    await admin.from("profiles").update({ visibility: "public" }).eq("id", alice.id);
    expect((await anon().from("profiles").select("id").eq("id", alice.id)).data).toHaveLength(1);
    expect((await carol.client.from("profiles").select("id").eq("id", alice.id)).data).toHaveLength(1);
    await admin.from("profiles").update({ visibility: "college" }).eq("id", alice.id);
  });

  it("hides a profile from someone it has blocked, in both directions", async () => {
    await admin.from("user_blocks").insert({ blocker_id: alice.id, blocked_id: bob.id });
    expect((await bob.client.from("profiles").select("id").eq("id", alice.id)).data).toHaveLength(0);
    expect((await alice.client.from("profiles").select("id").eq("id", bob.id)).data).toHaveLength(0);
    await admin.from("user_blocks").delete().eq("blocker_id", alice.id);
    expect((await bob.client.from("profiles").select("id").eq("id", alice.id)).data).toHaveLength(1);
  });

  it("hides class/semester unless the owner opts in", async () => {
    await alice.client.from("profile_class_info").upsert({ user_id: alice.id, current_year: 3, current_semester: 5 });
    expect((await bob.client.from("profile_class_info").select("*").eq("user_id", alice.id)).data).toHaveLength(0);
    expect((await alice.client.from("profile_class_info").select("*").eq("user_id", alice.id)).data).toHaveLength(1);
    await alice.client.from("profiles").update({ show_class: true }).eq("id", alice.id);
    expect((await bob.client.from("profile_class_info").select("*").eq("user_id", alice.id)).data).toHaveLength(1);
    await alice.client.from("profiles").update({ show_class: false }).eq("id", alice.id);
  });

  it("rejects reserved and malformed usernames and enforces the rename cooldown", async () => {
    for (const bad of ["admin", "feed", "a", "Has Space", "double--dash"]) {
      const { error } = await bob.client.from("profiles").update({ username: bad }).eq("id", bob.id);
      expect(error, `username ${bad}`).not.toBeNull();
    }
    const first = `bob-${Date.now().toString(36)}`;
    expect((await bob.client.from("profiles").update({ username: first }).eq("id", bob.id)).error).toBeNull();
    const second = await bob.client.from("profiles").update({ username: `${first}-2` }).eq("id", bob.id);
    expect(second.error?.message).toContain("username_cooldown");
    // The old name keeps redirecting.
    const { data } = await anon().from("slug_redirects").select("entity_id").eq("entity_type", "user").eq("old_slug", bob.username);
    expect(data?.[0]?.entity_id).toBe(bob.id);
  });

  it("changing college resets a verified badge", async () => {
    await admin.from("profiles").update({ verification_status: "verified", verified_at: new Date().toISOString() }).eq("id", bob.id);
    await bob.client.from("profiles").update({ college_id: RIVERSIDE }).eq("id", bob.id);
    const { data } = await admin.from("profiles").select("verification_status").eq("id", bob.id).single();
    expect(data.verification_status).toBe("unverified");
    await bob.client.from("profiles").update({ college_id: GREENFIELD }).eq("id", bob.id);
  });
});

describe("roles and permissions", () => {
  it("users cannot grant themselves roles", async () => {
    expect((await alice.client.from("user_roles").insert({ user_id: alice.id, role: "global_admin" })).error).not.toBeNull();
    const rpc = await alice.client.rpc("grant_role", { p_user: alice.id, p_role: "global_admin", p_college: null });
    expect(rpc.error).not.toBeNull();
    const { data } = await admin.from("user_roles").select("id").eq("user_id", alice.id);
    expect(data).toHaveLength(0);
  });

  it("a college admin cannot create global admins or act in another college", async () => {
    const asGlobal = await collegeAdmin.client.rpc("grant_role", { p_user: bob.id, p_role: "global_admin", p_college: null });
    expect(asGlobal.error?.message).toContain("forbidden");
    const otherCollege = await collegeAdmin.client.rpc("grant_role", { p_user: carol.id, p_role: "moderator", p_college: RIVERSIDE });
    expect(otherCollege.error?.message).toContain("forbidden");
    const asCollegeAdmin = await collegeAdmin.client.rpc("grant_role", { p_user: bob.id, p_role: "college_admin", p_college: GREENFIELD });
    expect(asCollegeAdmin.error?.message).toContain("forbidden");
  });

  it("a college admin can appoint a moderator for their own college, and it is audited", async () => {
    const res = await collegeAdmin.client.rpc("grant_role", { p_user: bob.id, p_role: "moderator", p_college: GREENFIELD });
    expect(res.error).toBeNull();
    const { data } = await admin.from("audit_logs").select("action, actor_id, college_id").eq("target_id", bob.id).eq("action", "role.granted");
    expect(data?.[0]).toMatchObject({ actor_id: collegeAdmin.id, college_id: GREENFIELD });
    // Scoped moderator holds report permissions only for Greenfield.
    expect((await bob.client.rpc("has_permission", { p_permission: "reports.view", p_college_id: GREENFIELD })).data).toBe(true);
    expect((await bob.client.rpc("has_permission", { p_permission: "reports.view", p_college_id: RIVERSIDE })).data).toBe(false);
    expect((await bob.client.rpc("has_permission", { p_permission: "settings.manage", p_college_id: null })).data).toBe(false);
  });

  it("a global admin can grant platform-wide roles and cannot remove the last global admin", async () => {
    const res = await globalAdmin.client.rpc("grant_role", { p_user: alice.id, p_role: "support_agent", p_college: null });
    expect(res.error).toBeNull();
    const { data: roles } = await admin.from("user_roles").select("id, role").eq("role", "global_admin");
    if (roles.length === 1) {
      const revoke = await globalAdmin.client.rpc("revoke_role", { p_role_id: roles[0].id });
      expect(revoke.error?.message).toContain("last_global_admin");
    }
  });

  it("suspended administrators lose their permissions immediately", async () => {
    const temp = await createUser("temp-mod");
    await grantRoleDirect(temp.id, "moderator", GREENFIELD);
    expect((await temp.client.rpc("has_permission", { p_permission: "reports.view", p_college_id: GREENFIELD })).data).toBe(true);
    await admin.from("profiles").update({ status: "suspended" }).eq("id", temp.id);
    expect((await temp.client.rpc("has_permission", { p_permission: "reports.view", p_college_id: GREENFIELD })).data).toBe(false);
  });
});

describe("audit log", () => {
  it("is invisible to ordinary users and visible to authorised staff", async () => {
    expect((await alice.client.from("audit_logs").select("id").limit(1)).data ?? []).toHaveLength(0);
    expect((await globalAdmin.client.from("audit_logs").select("id").limit(1)).data?.length).toBeGreaterThan(0);
  });

  it("is append-only, even for the service role", async () => {
    const { data } = await admin.from("audit_logs").select("id").limit(1).single();
    expect((await admin.from("audit_logs").update({ action: "tampered" }).eq("id", data.id)).error).not.toBeNull();
    expect((await admin.from("audit_logs").delete().eq("id", data.id)).error).not.toBeNull();
  });

  it("scrubs secrets from metadata", async () => {
    await admin.rpc("write_audit_log", {
      p_actor: globalAdmin.id,
      p_action: "test.scrub",
      p_target_type: "test",
      p_target_id: "1",
      p_college: null,
      p_metadata: { safe: "ok", password: "hunter2", access_token: "abc", message_body: "private words" },
    });
    const { data } = await admin.from("audit_logs").select("metadata").eq("action", "test.scrub").order("id", { ascending: false }).limit(1).single();
    expect(data.metadata).toEqual({ safe: "ok" });
  });
});

describe("college verification", () => {
  it("only lets a user create a pending request for their own college and account type", async () => {
    const bad = await alice.client.from("college_verifications").insert({ user_id: alice.id, college_id: RIVERSIDE, account_type: "student", method: "manual" });
    expect(bad.error).not.toBeNull();
    const selfApprove = await alice.client.from("college_verifications").insert({ user_id: alice.id, college_id: GREENFIELD, account_type: "student", method: "manual", status: "approved" });
    expect(selfApprove.error).not.toBeNull();
    const injected = await alice.client.from("college_verifications").insert({ user_id: alice.id, college_id: GREENFIELD, account_type: "student", method: "manual", reviewed_by: globalAdmin.id });
    expect(injected.error).not.toBeNull();
  });

  it("scopes review to the staff member's college and blocks self-review", async () => {
    const { data: req, error } = await alice.client
      .from("college_verifications")
      .insert({ user_id: alice.id, college_id: GREENFIELD, account_type: "student", method: "manual", supporting_info: "Roll number 1234, CSE department, prof. Rao knows me." })
      .select("id")
      .single();
    expect(error).toBeNull();
    expect((await admin.from("profiles").select("verification_status").eq("id", alice.id).single()).data.verification_status).toBe("pending");

    // Wrong college / ordinary user / the applicant herself are all refused.
    expect((await riversideStaff.client.rpc("review_college_verification", { p_id: req.id, p_decision: "approved" })).error?.message).toContain("forbidden");
    expect((await bob.client.rpc("review_college_verification", { p_id: req.id, p_decision: "approved" })).error).not.toBeNull();
    expect((await alice.client.rpc("review_college_verification", { p_id: req.id, p_decision: "approved" })).error).not.toBeNull();

    // Rejection requires a reason; verification staff of the right college can review.
    expect((await verifier.client.rpc("review_college_verification", { p_id: req.id, p_decision: "rejected" })).error?.message).toContain("reason_required");
    expect((await verifier.client.rpc("review_college_verification", { p_id: req.id, p_decision: "approved", p_notes: "checked with department" })).error).toBeNull();
    expect((await admin.from("profiles").select("verification_status").eq("id", alice.id).single()).data.verification_status).toBe("verified");

    // Decision is final and audited; the applicant cannot read internal reviewer notes.
    expect((await verifier.client.rpc("review_college_verification", { p_id: req.id, p_decision: "rejected", p_reason: "x" })).error?.message).toContain("already_decided");
    const notes = await alice.client.from("college_verifications").select("reviewer_notes").eq("id", req.id);
    expect(notes.error).not.toBeNull();
    const { data: audit } = await admin.from("audit_logs").select("action").eq("target_id", alice.id).eq("action", "verification.approved");
    expect(audit).toHaveLength(1);
  });

  it("verification staff cannot read user accounts they were not given access to", async () => {
    expect((await verifier.client.from("profiles").select("id").eq("id", dave.id)).data).toHaveLength(0);
    expect((await verifier.client.rpc("has_permission", { p_permission: "users.view", p_college_id: GREENFIELD })).data).toBe(false);
  });

  it("an email-domain request cannot be approved before the email is proven", async () => {
    const { data: req } = await carol.client
      .from("college_verifications")
      .insert({ user_id: carol.id, college_id: RIVERSIDE, account_type: "student", method: "email_domain", college_email: "carol@riverside.test" })
      .select("id")
      .single();
    const res = await admin.rpc("finalize_college_verification", { p_id: req.id, p_decision: "approved", p_reviewer: null });
    expect(res.error?.message).toContain("email_not_verified");
    await carol.client.from("college_verifications").update({ status: "cancelled" }).eq("id", req.id);
  });

  it("invite codes verify matching members once and honour usage limits", async () => {
    const make = await collegeAdmin.client.rpc("create_college_invite", { p_college: GREENFIELD, p_audience: "student", p_max_uses: 1, p_valid_days: 7 });
    expect(make.error).toBeNull();
    const code = make.data;
    // Another college's student cannot use it; a non-manager cannot mint codes.
    expect((await carol.client.rpc("redeem_college_invite", { p_code: code })).error?.message).toContain("invalid_invite");
    expect((await bob.client.rpc("create_college_invite", { p_college: GREENFIELD })).error).not.toBeNull();

    const inviteeUser = await createUser("invitee");
    expect((await inviteeUser.client.rpc("redeem_college_invite", { p_code: code })).error).toBeNull();
    expect((await admin.from("profiles").select("verification_status").eq("id", inviteeUser.id).single()).data.verification_status).toBe("verified");
    const second = await createUser("invitee2");
    expect((await second.client.rpc("redeem_college_invite", { p_code: code })).error?.message).toContain("invalid_invite");
    // Hashes are never exposed to the API.
    expect((await collegeAdmin.client.from("college_invites").select("code_hash")).error).not.toBeNull();
  });
});

describe("settings, flags and files", () => {
  it("exposes only public settings to anonymous visitors", async () => {
    const { data } = await anon().from("system_settings").select("key");
    const keys = data.map((r) => r.key);
    expect(keys).toContain("platform_name");
    expect(keys).not.toContain("rate_limits");
    expect(keys).not.toContain("ai_daily_limit_per_user");
  });

  it("only global admins can change settings and flags, and changes are audited", async () => {
    expect((await alice.client.rpc("set_system_setting", { p_key: "maintenance_mode", p_value: true })).error?.message).toContain("forbidden");
    expect((await collegeAdmin.client.rpc("set_feature_flag", { p_key: "messaging", p_enabled: false })).error?.message).toContain("forbidden");
    expect((await alice.client.from("system_settings").update({ value: true }).eq("key", "maintenance_mode")).data ?? null).toBeNull();
    expect((await admin.from("system_settings").select("value").eq("key", "maintenance_mode").single()).data.value).toBe(false);

    expect((await globalAdmin.client.rpc("set_feature_flag", { p_key: "events", p_enabled: false })).error).toBeNull();
    expect((await admin.from("feature_flags").select("enabled").eq("key", "events").single()).data.enabled).toBe(false);
    await globalAdmin.client.rpc("set_feature_flag", { p_key: "events", p_enabled: true });
    const { data: audit } = await admin.from("audit_logs").select("action").eq("action", "flag.updated").eq("target_id", "events");
    expect(audit.length).toBeGreaterThanOrEqual(2);
  });

  it("keeps private files private and public images readable", async () => {
    const mk = (owner, purpose, bucket) =>
      admin.from("files").insert({ owner_id: owner.id, bucket, storage_key: `${purpose}/${owner.id}/${crypto.randomUUID()}.png`, purpose, mime_type: "image/png", size_bytes: 10, status: "ready" }).select("id").single();
    const { data: doc } = await mk(alice, "verification_document", "private");
    const { data: avatar } = await mk(alice, "avatar", "private");
    expect((await bob.client.from("files").select("id").eq("id", doc.id)).data).toHaveLength(0);
    expect((await anon().from("files").select("id").eq("id", doc.id)).data).toHaveLength(0);
    expect((await alice.client.from("files").select("id").eq("id", doc.id)).data).toHaveLength(1);
    expect((await anon().from("files").select("id").eq("id", avatar.id)).data).toHaveLength(1);
  });

  it("stops users from pointing their avatar at someone else's file", async () => {
    const key = `avatar/${alice.id}/${crypto.randomUUID()}.png`;
    await admin.from("files").insert({ owner_id: alice.id, bucket: "private", storage_key: key, purpose: "avatar", mime_type: "image/png", size_bytes: 10, status: "ready" });
    expect((await bob.client.from("profiles").update({ avatar_key: key }).eq("id", bob.id)).error?.message).toContain("invalid_avatar");
    expect((await alice.client.from("profiles").update({ avatar_key: key }).eq("id", alice.id)).error).toBeNull();
  });

  it("denies API roles any privilege on internal tables", async () => {
    expect((await alice.client.from("college_email_challenges").select("id")).error).not.toBeNull();
    expect((await anon().from("reserved_usernames").select("name")).error).not.toBeNull();
    expect((await alice.client.from("contact_messages").select("id")).data ?? []).toHaveLength(0);
  });
});
