import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { admin, cleanupUsers, createUser, grantRoleDirect } from "../helpers/supabase.js";

/** Breach handling and access control: who can see it, the approval rules, the Board clock, the audit trail, and the DB self-audit. */
vi.mock("@/lib/email", () => ({ sendEmail: async () => ({ ok: true }) }));
const { draftNotice } = await import("@/lib/privacy/incident-templates");

let officer1, officer2, globalAdmin, member, affected;
const FACTS = {
  p_patch: {
    description: "A storage rule exposed profile photos for two hours.", occurred_at: new Date(Date.now() - 3 * 3600_000).toISOString(),
    data_categories: ["profile"], systems: ["file storage"], containment: "The rule was corrected.", remediation: "A check now runs on every deploy.", root_cause: "A hand edit.",
  },
};
const create = (u, over = {}) => u.client.rpc("create_privacy_incident", { p_title: "Exposed photos", p_severity: "high", p_detected_at: new Date().toISOString(), p_description: "", p_systems: [], p_categories: [], ...over });

beforeAll(async () => {
  [officer1, officer2, globalAdmin, member, affected] = await Promise.all(["inc-o1", "inc-o2", "inc-gadmin", "inc-member", "inc-affected"].map((l) => createUser(l)));
  await grantRoleDirect(officer1.id, "privacy_officer");
  await grantRoleDirect(officer2.id, "privacy_officer");
  await grantRoleDirect(globalAdmin.id, "global_admin");
});
afterAll(cleanupUsers);

describe("access", () => {
  it("only privacy officers can open, read or change breach records: not members, not global administrators", async () => {
    const { data } = await create(officer1);
    for (const who of [member, globalAdmin]) {
      expect((await create(who)).error?.message).toMatch(/forbidden/);
      expect((await who.client.from("privacy_incidents").select("id").eq("id", data.id)).data).toEqual([]);
      expect((await who.client.from("privacy_incident_events").select("id")).data).toEqual([]);
      expect((await who.client.rpc("update_privacy_incident", { p_id: data.id, p_patch: { title: "x y z" } })).error?.message).toMatch(/forbidden/);
      expect((await who.client.rpc("privacy_access_snapshot")).error?.message).toMatch(/forbidden/);
    }
    expect((await officer2.client.from("privacy_incidents").select("id").eq("id", data.id)).data).toHaveLength(1);
  });

  it("cannot be written to directly, and the timeline cannot be rewritten", async () => {
    const { data } = await create(officer1);
    expect((await officer1.client.from("privacy_incidents").update({ status: "closed" }).eq("id", data.id).select()).data ?? []).toEqual([]);
    expect((await admin.from("privacy_incident_events").update({ body: "edited" }).eq("incident_id", data.id)).error?.message).toMatch(/append-only/);
    expect((await admin.from("privacy_incident_events").delete().eq("incident_id", data.id)).error?.message).toMatch(/append-only/);
  });
});

describe("the incident lifecycle", () => {
  it("starts the 72-hour clock only when the breach is confirmed, with a reason", async () => {
    const { data } = await create(officer1);
    const row = () => admin.from("privacy_incidents").select("status, aware_at").eq("id", data.id).single().then((r) => r.data);
    expect((await row()).aware_at).toBeNull();
    expect((await officer1.client.rpc("set_privacy_incident_status", { p_id: data.id, p_to: "closed", p_note: "skip ahead" })).error?.message).toMatch(/invalid_state/);
    expect((await officer1.client.rpc("set_privacy_incident_status", { p_id: data.id, p_to: "confirmed", p_note: "" })).error?.message).toMatch(/reason_required/);
    expect((await officer1.client.rpc("set_privacy_incident_status", { p_id: data.id, p_to: "confirmed", p_note: "Photos were reachable without signing in." })).error).toBeNull();
    const after = await row();
    expect(after.status).toBe("confirmed");
    expect(after.aware_at).not.toBeNull();
    expect((await officer1.client.rpc("set_privacy_incident_status", { p_id: data.id, p_to: "notified", p_note: "told them" })).error?.message).toMatch(/nothing_sent/);
  });

  it("accepts only known fields, and the audit log never receives the text of an incident", async () => {
    const { data } = await create(officer1, { p_description: "Secret-sounding detail about named people" });
    expect((await officer1.client.rpc("update_privacy_incident", { p_id: data.id, p_patch: { status: "closed" } })).error?.message).toMatch(/invalid_field/);
    expect((await officer1.client.rpc("update_privacy_incident", { p_id: data.id, p_patch: { aware_at: new Date().toISOString() } })).error?.message).toMatch(/invalid_state/);
    expect((await officer1.client.rpc("update_privacy_incident", { p_id: data.id, ...FACTS })).error).toBeNull();
    const { data: logs } = await admin.from("audit_logs").select("action, target_id, metadata").eq("target_id", data.reference);
    expect(logs.length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(logs)).not.toMatch(/Secret-sounding|storage rule|photos/);
  });
});

describe("notices", () => {
  let inc;
  beforeAll(async () => {
    inc = (await create(officer1)).data;
    await officer1.client.rpc("update_privacy_incident", { p_id: inc.id, ...FACTS });
    await officer1.client.rpc("set_privacy_incident_status", { p_id: inc.id, p_to: "confirmed", p_note: "Confirmed from the access logs." });
  });
  const save = (u, audience, body) => u.client.rpc("save_privacy_incident_notice", { p_id: inc.id, p_audience: audience, p_subject: "Important notice", p_body: body });
  const approve = (u, id) => u.client.rpc("approve_privacy_incident_notice", { p_notice_id: id });
  const GOOD = "We are writing to tell you about a security incident. Here is what happened, what it may mean, what we did and who to ask.";

  it("cannot be approved while a [to be completed] marker or a required fact is missing", async () => {
    const { data: id } = await save(officer1, "board_initial", `${GOOD} [to be completed: likely impact]`);
    expect((await approve(officer2, id)).error?.message).toMatch(/incident_facts_missing.*to be completed/);
    const { data: pid } = await save(officer1, "principals", GOOD);
    expect((await approve(officer2, pid)).error?.message).toMatch(/affected members/);
  });

  it("cannot be approved by the person who wrote it (unless the team allowed that), nor by someone without the approval permission", async () => {
    const { data: id } = await save(officer1, "board_initial", GOOD);
    expect((await approve(officer1, id)).error?.message).toMatch(/cannot_review_own_request/);
    expect((await approve(globalAdmin, id)).error?.message).toMatch(/forbidden/);
    expect((await approve(officer2, id)).error).toBeNull();
    expect((await admin.from("privacy_incident_notices").select("status, approved_by").eq("id", id).single()).data).toEqual({ status: "approved", approved_by: officer2.id });
  });

  it("goes back to draft when the facts or the text change after approval", async () => {
    const { data: id } = await save(officer1, "board_detailed", GOOD);
    await approve(officer2, id);
    await officer1.client.rpc("update_privacy_incident", { p_id: inc.id, p_patch: { root_cause: "A hand edit, and no review step." } });
    expect((await admin.from("privacy_incident_notices").select("status").eq("id", id).single()).data.status).toBe("draft");
  });

  it("records a Board submission only for an approved notice, with the reference the Board gave", async () => {
    const { data: id } = await save(officer1, "board_initial", GOOD);
    expect((await officer1.client.rpc("mark_privacy_incident_notice_sent", { p_notice_id: id, p_reference: "B-1" })).error?.message).toMatch(/invalid_state/);
    await approve(officer2, id);
    expect((await officer1.client.rpc("mark_privacy_incident_notice_sent", { p_notice_id: id, p_reference: "BOARD-42" })).error).toBeNull();
    const { data } = await admin.from("privacy_incidents").select("board_initial_at, board_reference").eq("id", inc.id).single();
    expect(data.board_initial_at).not.toBeNull();
    expect(data.board_reference).toBe("BOARD-42");
    expect((await save(officer1, "board_initial", GOOD)).error?.message).toMatch(/already_sent/);
  });

  it("reaches affected members by notification and email, once each, and only after approval", async () => {
    await officer1.client.rpc("add_privacy_incident_affected", { p_id: inc.id, p_user_ids: [affected.id] });
    const { data: id } = await save(officer1, "principals", `${GOOD} It involved your profile photo.`);
    const { sendPrincipalNotice } = await import("@/lib/privacy/incidents");
    // Called with the officer's session in the app; here the server client is replaced by the officer's client.
    vi.doMock("@/lib/supabase/server", () => ({ createClient: async () => officer1.client }));
    vi.resetModules();
    const fresh = await import("@/lib/privacy/incidents");
    expect((await fresh.sendPrincipalNotice(id)).ok).toBe(false); // still a draft
    await approve(officer2, id);
    const res = await fresh.sendPrincipalNotice(id);
    expect(res.ok).toBe(true);
    expect(sendPrincipalNotice).toBeTypeOf("function");
    const { data: n } = await admin.from("notifications").select("type, category, data").eq("user_id", affected.id).eq("type", "moderation_privacy_incident");
    expect(n).toHaveLength(1);
    expect(n[0].category).toBe("moderation");
    expect((await admin.from("privacy_incident_affected").select("notified_at").eq("user_id", affected.id).eq("incident_id", inc.id).single()).data.notified_at).not.toBeNull();
    expect((await admin.from("privacy_incidents").select("principals_notified_at").eq("id", inc.id).single()).data.principals_notified_at).not.toBeNull();
    expect((await fresh.sendPrincipalNotice(id)).ok).toBe(false); // nothing left to send, nothing sent twice
    expect((await admin.from("notifications").select("id").eq("user_id", affected.id).eq("type", "moderation_privacy_incident")).data).toHaveLength(1);
  });

  it("lets the drafting officer approve only when the team switched self-approval on", async () => {
    await officer1.client.rpc("set_privacy_setting", { p_key: "privacy_incident_self_approval", p_value: true });
    const { data: id } = await save(officer1, "board_detailed", `${GOOD} Updated detail.`);
    expect((await approve(officer1, id)).error).toBeNull();
    await officer1.client.rpc("set_privacy_setting", { p_key: "privacy_incident_self_approval", p_value: false });
  });

  it("drafts from the record and leaves the unknowns for a person", () => {
    const d = draftNotice("principals", { reference: "INC-1", severity: "high", systems: [], data_categories: [], description: "Photos were exposed." });
    expect(d.body).toContain("Photos were exposed.");
    expect(d.body).toMatch(/\[to be completed/);
  });
});

describe("access review", () => {
  it("lists the staff with their privacy permissions, and a review is a permanent snapshot", async () => {
    const { data } = await officer1.client.rpc("privacy_access_snapshot");
    expect(data.some((r) => r.role === "privacy_officer" && r.permissions.includes("privacy.incidents"))).toBe(true);
    expect(data.filter((r) => r.role === "global_admin").every((r) => r.permissions.length === 0)).toBe(true);
    const { data: id, error } = await officer1.client.rpc("record_privacy_access_review", { p_notes: "Checked everyone." });
    expect(error).toBeNull();
    expect((await admin.from("privacy_access_reviews").update({ notes: "edited" }).eq("id", id)).error?.message).toMatch(/append-only/);
    expect((await member.client.rpc("record_privacy_access_review", { p_notes: "x" })).error?.message).toMatch(/forbidden/);
  });
});

describe("database self-audit", () => {
  it("every table has row level security, and none of the privacy functions can be called by a signed-out visitor", async () => {
    const { data } = await admin.rpc("privacy_security_audit");
    expect(data.tables_without_rls).toEqual([]);
    const open = new Set(data.definer_functions_callable_by_anon);
    // Deliberately public helpers only.
    expect([...open].sort()).toEqual(["flag_enabled", "has_permission", "setting_bool", "username_available"]);
    // None of the privacy tables can be written to by members directly.
    const writable = new Set(data.tables_authenticated_can_write);
    for (const t of ["consent_current", "consent_events", "privacy_requests", "privacy_request_events", "privacy_incidents", "privacy_incident_events", "privacy_incident_notices", "privacy_incident_affected", "privacy_nominations", "erasure_ledger", "privacy_notice_versions", "privacy_access_reviews", "account_deletion_requests"]) {
      expect(writable.has(t), `${t} must not be writable by members`).toBe(false);
    }
    expect((await member.client.rpc("privacy_security_audit")).error).not.toBeNull();
  });
});
