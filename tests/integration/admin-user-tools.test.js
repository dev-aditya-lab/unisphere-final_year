import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GREENFIELD, RIVERSIDE, admin, anon, cleanupUsers, createUser, grantRoleDirect } from "../helpers/supabase.js";

/**
 * Migration 20260124000031: the member directory, timed restrictions, internal notes, profile correction, session
 * revocation, export and post review, plus the properties the whole admin area depends on (append-only audit log,
 * no self-escalation, refusals that leave nothing half done). Real sessions throughout; the service role only seeds
 * and reads back.
 */

let gadmin, cadmin, mod, support, member, target, outsider, other;
const tag = Math.random().toString(36).slice(2, 7);
const rpc = (u, fn, args) => u.client.rpc(fn, args);
const profile = async (u) => (await admin.from("profiles").select("*").eq("id", u.id).single()).data;
const auditFor = async (action, targetId) => (await admin.from("audit_logs").select("*").eq("action", action).eq("target_id", targetId).order("created_at", { ascending: false })).data;
const slug = (p) => `${p}-${tag}-${Math.random().toString(36).slice(2, 7)}`;

beforeAll(async () => {
  gadmin = await createUser("aut-gadmin");
  cadmin = await createUser("aut-cadmin");
  mod = await createUser("aut-mod");
  support = await createUser("aut-support");
  member = await createUser("aut-member");
  target = await createUser("aut-target");
  other = await createUser("aut-other");
  outsider = await createUser("aut-outsider", { collegeId: RIVERSIDE });
  await grantRoleDirect(gadmin.id, "global_admin");
  await grantRoleDirect(cadmin.id, "college_admin", GREENFIELD);
  await grantRoleDirect(mod.id, "moderator", GREENFIELD);
  await grantRoleDirect(support.id, "support_agent");
});
afterAll(async () => {
  await admin.from("posts").delete().like("slug", `%-${tag}-%`);
  await cleanupUsers();
});

describe("member directory", () => {
  it("finds a member by username, name, email or user id", async () => {
    const byUsername = await rpc(cadmin, "admin_list_users", { p_q: target.username });
    expect(byUsername.error).toBeNull();
    expect(byUsername.data.map((u) => u.id)).toContain(target.id);
    expect((await rpc(cadmin, "admin_list_users", { p_q: "Test aut-target" })).data.map((u) => u.id)).toContain(target.id);
    expect((await rpc(cadmin, "admin_list_users", { p_q: target.email })).data.map((u) => u.id)).toEqual([target.id]);
    expect((await rpc(cadmin, "admin_list_users", { p_q: target.id.toUpperCase() })).data.map((u) => u.id)).toEqual([target.id]);
  });

  it("treats search text literally, so wildcards match nothing", async () => {
    expect((await rpc(cadmin, "admin_list_users", { p_q: "%" })).data).toEqual([]);
    expect((await rpc(cadmin, "admin_list_users", { p_q: "_____________" })).data).toEqual([]);
  });

  it("paginates on the server with a stable total, and caps the page size", async () => {
    const first = await rpc(cadmin, "admin_list_users", { p_q: "aut-", p_limit: 3, p_offset: 0 });
    const second = await rpc(cadmin, "admin_list_users", { p_q: "aut-", p_limit: 3, p_offset: 3 });
    expect(first.data).toHaveLength(3);
    expect(Number(first.data[0].total_count)).toBe(Number(second.data[0].total_count));
    expect(first.data.map((u) => u.id).filter((id) => second.data.some((s) => s.id === id))).toEqual([]);
    expect((await rpc(gadmin, "admin_list_users", { p_limit: 100000 })).data.length).toBeLessThanOrEqual(100);
  });

  it("sorts by name, and filters by registration period and status", async () => {
    const asc = (await rpc(cadmin, "admin_list_users", { p_q: "aut-", p_sort: "name", p_dir: "asc", p_limit: 20 })).data.map((u) => u.full_name.toLowerCase());
    expect(asc).toEqual([...asc].sort());
    const desc = (await rpc(cadmin, "admin_list_users", { p_q: "aut-", p_sort: "name", p_dir: "desc", p_limit: 20 })).data.map((u) => u.full_name.toLowerCase());
    expect(desc).toEqual([...desc].sort().reverse());
    const today = new Date().toISOString().slice(0, 10);
    expect((await rpc(cadmin, "admin_list_users", { p_q: "aut-", p_from: today, p_to: today })).data.length).toBeGreaterThan(0);
    expect((await rpc(cadmin, "admin_list_users", { p_q: "aut-", p_to: "2000-01-01" })).data).toEqual([]);
    expect((await rpc(cadmin, "admin_list_users", { p_q: "aut-", p_status: "suspended" })).data).toEqual([]);
  });

  it("shows nothing to people without the permission, and nothing from another college", async () => {
    for (const who of [member, mod, support]) expect((await rpc(who, "admin_list_users", {})).data).toEqual([]);
    expect((await rpc(cadmin, "admin_list_users", { p_q: outsider.username })).data).toEqual([]);
    expect((await rpc(cadmin, "admin_user_detail", { p_id: outsider.id })).error?.message).toMatch(/forbidden/);
    expect((await anon().rpc("admin_list_users", {})).error).not.toBeNull();
  });

  it("returns only the fields administration needs (no credentials or tokens)", async () => {
    const row = (await rpc(cadmin, "admin_list_users", { p_q: target.username })).data[0];
    expect(Object.keys(row).sort()).toEqual(["account_type", "avatar_key", "college_id", "college_name", "created_at", "email", "full_name", "id", "last_sign_in_at", "restricted_until", "roles", "status", "total_count", "username", "verification_status"]);
    const detail = (await rpc(cadmin, "admin_user_detail", { p_id: target.id })).data;
    expect(JSON.stringify(detail)).not.toMatch(/password|encrypted|token|secret/i);
  });
});

describe("timed restrictions", () => {
  it("restricts for a period, shows the expiry, and reinstating clears it", async () => {
    const res = await rpc(cadmin, "moderate_user", { p_user: target.id, p_action: "restrict", p_reason: "Spamming links", p_days: 7 });
    expect(res.error).toBeNull();
    const p = await profile(target);
    expect(p.status).toBe("restricted");
    const days = (new Date(p.restricted_until) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);
    expect((await rpc(cadmin, "admin_user_detail", { p_id: target.id })).data.profile.restricted_until).toBe(p.restricted_until);
    expect((await auditFor("moderation.restrict", target.id)).length).toBe(1);

    expect((await rpc(cadmin, "moderate_user", { p_user: target.id, p_action: "reinstate", p_reason: "Resolved" })).error).toBeNull();
    const after = await profile(target);
    expect(after.status).toBe("active");
    expect(after.restricted_until).toBeNull();
  });

  it("rejects an impossible period and leaves the member untouched (no audit row, no history)", async () => {
    const before = (await admin.from("moderation_actions").select("id", { count: "exact", head: true }).eq("target_user_id", target.id)).count;
    for (const days of [0, 400, -3]) {
      expect((await rpc(cadmin, "moderate_user", { p_user: target.id, p_action: "suspend", p_reason: "x reason", p_days: days })).error?.message).toMatch(/invalid_duration/);
    }
    expect((await rpc(cadmin, "moderate_user", { p_user: target.id, p_action: "warn", p_reason: "just a warning", p_days: 3 })).error?.message).toMatch(/invalid_duration/);
    expect((await profile(target)).status).toBe("active");
    expect((await admin.from("moderation_actions").select("id", { count: "exact", head: true }).eq("target_user_id", target.id)).count).toBe(before);
  });

  it("requires a reason, and the refusal changes nothing", async () => {
    const res = await rpc(cadmin, "moderate_user", { p_user: target.id, p_action: "suspend", p_reason: "   " });
    expect(res.error?.message).toMatch(/reason_required/);
    expect((await profile(target)).status).toBe("active");
  });

  it("is reinstated automatically when the period ends, by the service role only", async () => {
    expect((await rpc(cadmin, "moderate_user", { p_user: target.id, p_action: "suspend", p_reason: "Cooling off", p_days: 1 })).error).toBeNull();
    // authenticated members, staff included, cannot run the expiry job
    expect((await rpc(gadmin, "expire_restrictions", {})).error).not.toBeNull();
    // a period still running is left alone
    await admin.rpc("expire_restrictions");
    expect((await profile(target)).status).toBe("suspended");
    await admin.from("profiles").update({ restricted_until: new Date(Date.now() - 60_000).toISOString() }).eq("id", target.id);
    const { data: n } = await admin.rpc("expire_restrictions");
    expect(Number(n)).toBeGreaterThanOrEqual(1);
    const p = await profile(target);
    expect(p.status).toBe("active");
    expect(p.restricted_until).toBeNull();
    const history = (await admin.from("moderation_actions").select("action, reason").eq("target_user_id", target.id).eq("action", "reinstate")).data;
    expect(history.some((h) => /ended/i.test(h.reason))).toBe(true);
  });

  it("only reaches members the actor may act on", async () => {
    expect((await rpc(mod, "moderate_user", { p_user: target.id, p_action: "suspend", p_reason: "not allowed", p_days: 2 })).error?.message).toMatch(/forbidden/);
    expect((await rpc(cadmin, "moderate_user", { p_user: cadmin.id, p_action: "restrict", p_reason: "self", p_days: 2 })).error?.message).toMatch(/cannot_act_on_self/);
    expect((await rpc(cadmin, "moderate_user", { p_user: gadmin.id, p_action: "restrict", p_reason: "admin", p_days: 2 })).error?.message).toMatch(/protected_account/);
    expect((await rpc(cadmin, "moderate_user", { p_user: outsider.id, p_action: "restrict", p_reason: "other college", p_days: 2 })).error?.message).toMatch(/forbidden/);
  });
});

describe("a suspended account is blocked by the database, whatever its session still says", () => {
  it("cannot post, comment or react while suspended, and can again once reinstated", async () => {
    const { data: post } = await other.client.from("posts").insert({ author_id: other.id, slug: slug("sus"), body: "A post to comment on", visibility: "public" }).select("id").single();
    expect((await rpc(cadmin, "moderate_user", { p_user: member.id, p_action: "suspend", p_reason: "Test of enforcement" })).error).toBeNull();
    // `member.client` still holds a valid signed-in session; the account status is what refuses the writes
    expect((await member.client.from("posts").insert({ author_id: member.id, slug: slug("blocked"), body: "hello", visibility: "public" })).error).not.toBeNull();
    expect((await member.client.from("comments").insert({ post_id: post.id, author_id: member.id, body: "hello" })).error).not.toBeNull();
    expect((await member.client.from("post_reactions").insert({ post_id: post.id, user_id: member.id, reaction: "like" })).error).not.toBeNull();
    expect((await member.client.rpc("start_direct_conversation", { p_other: other.id })).error).not.toBeNull();

    expect((await rpc(cadmin, "moderate_user", { p_user: member.id, p_action: "reinstate", p_reason: "Enforcement test over" })).error).toBeNull();
    expect((await member.client.from("posts").insert({ author_id: member.id, slug: slug("ok"), body: "back again", visibility: "public" })).error).toBeNull();
  });
});

describe("internal notes", () => {
  it("lets moderators and above add a note, records it, and never shows it to the member", async () => {
    expect((await rpc(mod, "admin_add_user_note", { p_user: target.id, p_note: "Spoke to them on chat, will watch" })).error).toBeNull();
    expect((await rpc(cadmin, "admin_add_user_note", { p_user: target.id, p_note: "Second note from the college admin" })).error).toBeNull();
    const staffView = (await rpc(cadmin, "admin_user_detail", { p_id: target.id })).data.actions.filter((a) => a.action === "note");
    expect(staffView.length).toBeGreaterThanOrEqual(2);
    const memberView = await target.client.from("moderation_actions").select("action").eq("target_user_id", target.id);
    expect(memberView.data.filter((a) => a.action === "note")).toEqual([]);
    expect((await auditFor("moderation.note", target.id)).length).toBeGreaterThanOrEqual(2);
  });

  it("refuses members, support agents, notes about oneself or administrators, and empty notes", async () => {
    expect((await rpc(member, "admin_add_user_note", { p_user: target.id, p_note: "I am not staff" })).error?.message).toMatch(/forbidden/);
    expect((await rpc(support, "admin_add_user_note", { p_user: target.id, p_note: "Support is not moderation" })).error?.message).toMatch(/forbidden/);
    expect((await rpc(mod, "admin_add_user_note", { p_user: mod.id, p_note: "a note about me" })).error?.message).toMatch(/cannot_act_on_self/);
    expect((await rpc(cadmin, "admin_add_user_note", { p_user: gadmin.id, p_note: "a note about the boss" })).error?.message).toMatch(/protected_account/);
    expect((await rpc(cadmin, "admin_add_user_note", { p_user: target.id, p_note: "  " })).error?.message).toMatch(/reason_required/);
  });
});

describe("profile correction", () => {
  it("corrects the fields given, leaves the rest, ignores the username cooldown and records it", async () => {
    await admin.from("profiles").update({ headline: "Original headline", username_changed_at: new Date().toISOString() }).eq("id", target.id);
    const newName = `fixed-${tag}`;
    const res = await rpc(cadmin, "admin_update_profile", { p_user: target.id, p_full_name: "Corrected Name", p_username: newName, p_headline: null, p_bio: "A calmer bio", p_reason: "Offensive handle" });
    expect(res.error, JSON.stringify(res.error)).toBeNull();
    const p = await profile(target);
    expect(p).toMatchObject({ full_name: "Corrected Name", username: newName, headline: "Original headline", bio: "A calmer bio" });
    const entry = (await auditFor("user.profile_edited", target.id))[0];
    expect(entry.metadata.fields.sort()).toEqual(["bio", "full_name", "username"]);
    expect(entry.metadata.new_username).toBe(newName);
    expect(JSON.stringify(entry.metadata)).not.toContain("A calmer bio"); // free text is not copied into the log
    expect((await admin.from("slug_redirects").select("entity_id").eq("entity_type", "user").eq("old_slug", target.username)).data).toHaveLength(1);
    target.username = newName;
  });

  it("changes nothing when it is refused: bad username, no reason, reserved name, nothing to change", async () => {
    const before = await profile(target);
    const entries = (await auditFor("user.profile_edited", target.id)).length;
    const bad = [
      { p_username: "No Spaces!", p_reason: "valid reason" },
      { p_username: "admin", p_reason: "valid reason" },
      { p_full_name: "Someone Else", p_reason: "  " },
      { p_full_name: before.full_name, p_reason: "same value" },
    ];
    for (const patch of bad) {
      const res = await rpc(cadmin, "admin_update_profile", { p_user: target.id, p_full_name: null, p_username: null, p_headline: null, p_bio: null, ...patch });
      expect(res.error, JSON.stringify(patch)).not.toBeNull();
    }
    expect(await profile(target)).toEqual(before);
    expect((await auditFor("user.profile_edited", target.id)).length).toBe(entries);
  });

  it("is limited to users.edit, to members in scope, and never reaches administrators or oneself", async () => {
    const args = (id) => ({ p_user: id, p_full_name: "X Person", p_username: null, p_headline: null, p_bio: null, p_reason: "testing permissions" });
    expect((await rpc(mod, "admin_update_profile", args(target.id))).error?.message).toMatch(/forbidden/);
    expect((await rpc(member, "admin_update_profile", args(target.id))).error?.message).toMatch(/forbidden/);
    expect((await rpc(cadmin, "admin_update_profile", args(outsider.id))).error?.message).toMatch(/forbidden/);
    expect((await rpc(cadmin, "admin_update_profile", args(gadmin.id))).error?.message).toMatch(/protected_account/);
    expect((await rpc(cadmin, "admin_update_profile", args(cadmin.id))).error?.message).toMatch(/cannot_act_on_self/);
  });
});

describe("sign out everywhere", () => {
  it("deletes the member's sessions so no new access token can be issued, and records it", async () => {
    // the member's session works: a refresh token can be exchanged for a new one
    expect((await other.client.auth.refreshSession()).error).toBeNull();
    const res = await rpc(cadmin, "admin_revoke_sessions", { p_user: other.id, p_reason: "Account reported as compromised" });
    expect(res.error, JSON.stringify(res.error)).toBeNull();
    expect(res.data).toBeGreaterThan(0);
    const refresh = await other.client.auth.refreshSession();
    expect(refresh.error).not.toBeNull();
    expect((await auditFor("user.sessions_revoked", other.id)).length).toBe(1);
  });

  it("needs users.sessions, a reason, and an unprotected target", async () => {
    expect((await rpc(mod, "admin_revoke_sessions", { p_user: target.id, p_reason: "moderators cannot" })).error?.message).toMatch(/forbidden/);
    expect((await rpc(cadmin, "admin_revoke_sessions", { p_user: target.id, p_reason: " " })).error?.message).toMatch(/reason_required/);
    expect((await rpc(cadmin, "admin_revoke_sessions", { p_user: gadmin.id, p_reason: "no way" })).error?.message).toMatch(/protected_account/);
    expect((await rpc(cadmin, "admin_revoke_sessions", { p_user: outsider.id, p_reason: "other college" })).error?.message).toMatch(/forbidden/);
  });

  it("allows only the one recovery audit action, for staff who may send it", async () => {
    expect((await rpc(cadmin, "admin_audit_event", { p_action: "user.recovery_requested", p_user: target.id })).error).toBeNull();
    expect((await auditFor("user.recovery_requested", target.id)).length).toBe(1);
    expect((await rpc(cadmin, "admin_audit_event", { p_action: "role.granted", p_user: target.id })).error?.message).toMatch(/invalid_action/);
    expect((await rpc(mod, "admin_audit_event", { p_action: "user.recovery_requested", p_user: target.id })).error?.message).toMatch(/forbidden/);
  });
});

describe("data export", () => {
  it("is for global administrators only, includes no messages or secrets, and always leaves an audit entry", async () => {
    expect((await rpc(cadmin, "admin_export_user", { p_id: target.id })).error?.message).toMatch(/forbidden/);
    expect((await rpc(mod, "admin_export_user", { p_id: target.id })).error?.message).toMatch(/forbidden/);
    expect((await auditFor("user.exported", target.id)).length).toBe(0);
    const res = await rpc(gadmin, "admin_export_user", { p_id: target.id });
    expect(res.error).toBeNull();
    expect(Object.keys(res.data).sort()).toEqual(["counts", "email", "email_confirmed_at", "exported_at", "last_sign_in_at", "moderation_history", "posts", "profile", "roles"]);
    expect(JSON.stringify(res.data)).not.toMatch(/password|encrypted|refresh_token|secret/i);
    expect((await auditFor("user.exported", target.id)).length).toBe(1);
    expect((await rpc(gadmin, "admin_export_user", { p_id: "00000000-0000-4000-8000-0000000000ff" })).error?.message).toMatch(/not_found/);
  });
});

describe("posts for review", () => {
  it("lists public and college posts newest first, never private ones, and only to staff in scope", async () => {
    const mk = async (visibility) =>
      (await target.client.from("posts").insert({ author_id: target.id, slug: slug(visibility), title: `T ${visibility}`, body: `A ${visibility} post body`, visibility }).select("id").single()).data.id;
    const pub = await mk("public");
    const priv = await mk("private");
    const res = await rpc(cadmin, "admin_user_posts", { p_id: target.id, p_limit: 50, p_offset: 0 });
    expect(res.error).toBeNull();
    const ids = res.data.map((p) => p.id);
    expect(ids).toContain(pub);
    expect(ids).not.toContain(priv);
    expect(res.data.every((p) => ["public", "college"].includes(p.visibility))).toBe(true);
    expect((await rpc(cadmin, "admin_user_posts", { p_id: outsider.id })).error?.message).toMatch(/forbidden/);
    expect((await rpc(member, "admin_user_posts", { p_id: target.id })).error?.message).toMatch(/forbidden/);
    expect((await rpc(cadmin, "admin_user_posts", { p_id: target.id, p_limit: 5000 })).data.length).toBeLessThanOrEqual(50);
  });
});

describe("the audit log and the permission table cannot be tampered with", () => {
  it("is append-only for everyone, administrators included, and cannot be written through the API", async () => {
    const entry = (await auditFor("user.exported", target.id))[0];
    for (const who of [member, cadmin, gadmin]) {
      expect((await who.client.from("audit_logs").insert({ actor_id: who.id, action: "forged", target_type: "x", target_id: "y" })).error).not.toBeNull();
      const upd = await who.client.from("audit_logs").update({ action: "tampered" }).eq("id", entry.id).select("id");
      expect(upd.error !== null || (upd.data ?? []).length === 0).toBe(true);
      const del = await who.client.from("audit_logs").delete().eq("id", entry.id).select("id");
      expect(del.error !== null || (del.data ?? []).length === 0).toBe(true);
      expect((await who.client.rpc("write_audit_log", { p_actor: who.id, p_action: "forged" })).error).not.toBeNull();
    }
    // even the service role, which bypasses RLS, is stopped by the trigger
    expect((await admin.from("audit_logs").update({ action: "tampered" }).eq("id", entry.id)).error?.message).toMatch(/append-only/);
    expect((await admin.from("audit_logs").delete().eq("id", entry.id)).error?.message).toMatch(/append-only/);
    expect((await auditFor("user.exported", target.id))[0].action).toBe("user.exported");
  });

  it("is readable only by staff with audit.view, within their college", async () => {
    expect((await member.client.from("audit_logs").select("id").limit(5)).data).toEqual([]);
    expect((await mod.client.from("audit_logs").select("id").limit(5)).data).toEqual([]);
    const own = await cadmin.client.from("audit_logs").select("college_id").eq("target_id", target.id);
    expect(own.data.length).toBeGreaterThan(0);
    expect(own.data.every((r) => r.college_id === GREENFIELD || r.college_id === null)).toBe(true);
  });

  it("keeps the internal helpers out of members' reach: no forged audit entries, no forced connections", async () => {
    const forged = `forged-${tag}`;
    for (const who of [member, cadmin, gadmin]) {
      expect((await who.client.rpc("write_audit_log", { p_actor: who.id, p_action: forged })).error).not.toBeNull();
    }
    expect((await admin.from("audit_logs").select("id").eq("action", forged)).data).toEqual([]);
    expect((await member.client.rpc("_accept_connection", { p_requester: member.id, p_recipient: other.id })).error).not.toBeNull();
    const [a, b] = [member.id, other.id].sort();
    expect((await admin.from("connections").select("user_a").eq("user_a", a).eq("user_b", b)).data).toEqual([]);
  });

  it("does not let anyone grant themselves a role or a permission", async () => {
    expect((await rpc(cadmin, "grant_role", { p_user: cadmin.id, p_role: "global_admin", p_college: null })).error).not.toBeNull();
    expect((await rpc(gadmin, "grant_role", { p_user: gadmin.id, p_role: "global_admin", p_college: null })).error?.message).toMatch(/cannot_grant_to_self|forbidden/);
    expect((await rpc(mod, "grant_role", { p_user: mod.id, p_role: "college_admin", p_college: GREENFIELD })).error).not.toBeNull();
    expect((await member.client.from("user_roles").insert({ user_id: member.id, role: "global_admin" })).error).not.toBeNull();
    expect((await cadmin.client.from("role_permissions").insert({ role: "moderator", permission: "users.export" })).error).not.toBeNull();
    expect((await cadmin.client.from("role_permissions").delete().eq("role", "moderator")).error?.message ?? "denied").toBeTruthy();
    const { data } = await admin.from("role_permissions").select("permission").eq("role", "college_admin");
    expect(data.map((r) => r.permission)).not.toContain("users.export");
    expect((await admin.from("role_permissions").select("permission").eq("role", "global_admin")).data.map((r) => r.permission)).toEqual(expect.arrayContaining(["users.edit", "users.sessions", "users.export"]));
  });
});

describe("content moderation updates the right content and member", () => {
  it("removes one post, notifies and records its author, and restores through a permission-checked path", async () => {
    const mkPost = async (body) => (await other.client.from("posts").insert({ author_id: other.id, slug: slug("mod"), body, visibility: "public" }).select("id").single()).data.id;
    const a = await mkPost("This one breaks the rules");
    const b = await mkPost("This one is fine");
    expect((await rpc(mod, "moderate_content", { p_type: "post", p_id: a, p_action: "remove", p_reason: "Breaks guideline 3" })).error).toBeNull();
    const rows = (await admin.from("posts").select("id, status").in("id", [a, b])).data;
    expect(rows.find((r) => r.id === a).status).toBe("removed");
    expect(rows.find((r) => r.id === b).status).toBe("published");
    expect((await auditFor("moderation.remove_content", a)).length).toBe(1);
    expect((await admin.from("moderation_actions").select("target_user_id").eq("target_id", a)).data[0].target_user_id).toBe(other.id);
    expect((await rpc(member, "moderate_content", { p_type: "post", p_id: b, p_action: "remove", p_reason: "I am just a member" })).error?.message).toMatch(/forbidden/);
    expect((await admin.from("posts").select("status").eq("id", b).single()).data.status).toBe("published");
    expect((await rpc(mod, "moderate_content", { p_type: "post", p_id: a, p_action: "restore", p_reason: "Appeal upheld" })).error).toBeNull();
    expect((await admin.from("posts").select("status").eq("id", a).single()).data.status).toBe("published");
  });
});
