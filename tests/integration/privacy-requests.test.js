import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, anon, cleanupUsers, createUser, grantRoleDirect } from "../helpers/supabase.js";

/** Privacy requests, grievances and nominations: ownership, who may handle them, and the status history. */
let alice, bob, officer1, officer2, globalAdmin, moderator;
const tag = Math.random().toString(36).slice(2, 8); // visitor rows persist, so addresses must be unique per run
const hash = (code) => createHash("sha256").update(code).digest("hex");
const submit = (u, over = {}) => u.client.rpc("submit_privacy_request", { p_kind: "correction", p_subject: "Fix my email", p_details: "My email address has a typo in it, please correct it.", p_payload: {}, ...over });
const handle = (u, id, over = {}) => u.client.rpc("staff_update_privacy_request", { p_id: id, p_to_status: null, p_note_requester: null, p_note_internal: null, p_outcome_reason: null, p_assign: null, ...over });

beforeAll(async () => {
  [alice, bob, officer1, officer2, globalAdmin, moderator] = await Promise.all(["pr-alice", "pr-bob", "pr-officer1", "pr-officer2", "pr-gadmin", "pr-mod"].map((l) => createUser(l)));
  await grantRoleDirect(officer1.id, "privacy_officer");
  await grantRoleDirect(officer2.id, "privacy_officer");
  await grantRoleDirect(globalAdmin.id, "global_admin");
  await grantRoleDirect(moderator.id, "moderator");
});
afterAll(cleanupUsers);

describe("submitting", () => {
  it("creates a request with a reference, a deadline and a first history entry, as the signed-in member", async () => {
    const { data, error } = await submit(alice);
    expect(error).toBeNull();
    expect(data.reference).toMatch(/^PR-\d{4}-\d{6}$/);
    const days = (Date.parse(data.due_at) - Date.now()) / 86400000;
    expect(days).toBeGreaterThan(29);
    expect(days).toBeLessThan(31);
    const row = await admin.from("privacy_requests").select("user_id, status, kind, channel").eq("id", data.id).single();
    expect(row.data).toEqual({ user_id: alice.id, status: "received", kind: "correction", channel: "member" });
    const events = await admin.from("privacy_request_events").select("to_status, actor_kind").eq("request_id", data.id);
    expect(events.data).toEqual([{ to_status: "received", actor_kind: "requester" }]);
  });

  it("gives grievances a GR reference and the shorter published target", async () => {
    const { data } = await submit(alice, { p_kind: "grievance", p_subject: "Wrongly shown to others" });
    expect(data.reference).toMatch(/^GR-\d{4}-\d{6}$/);
    expect((Date.parse(data.due_at) - Date.now()) / 86400000).toBeLessThan(15);
  });

  it("validates input and refuses kinds that have their own route", async () => {
    expect((await submit(alice, { p_kind: "erasure" })).error?.message).toMatch(/invalid_kind/);
    expect((await submit(alice, { p_kind: "access" })).error?.message).toMatch(/invalid_kind/);
    expect((await submit(alice, { p_subject: "x" })).error?.message).toMatch(/invalid_subject/);
    expect((await submit(alice, { p_details: "short" })).error?.message).toMatch(/invalid_details/);
    expect((await anon().rpc("submit_privacy_request", { p_kind: "other", p_subject: "Hello there", p_details: "Some details here ok" })).error).not.toBeNull();
  });

  it("stops a member from flooding the queue", async () => {
    const flood = await createUser("pr-flood");
    for (let i = 0; i < 5; i++) expect((await submit(flood, { p_subject: `Request ${i}` })).error).toBeNull();
    expect((await submit(flood, { p_subject: "One too many" })).error?.message).toMatch(/too_many_open/);
  });

  it("cannot be written to directly", async () => {
    expect((await alice.client.from("privacy_requests").insert({ reference: "PR-2026-999999", kind: "other", subject: "x y z", due_at: new Date().toISOString() })).error).not.toBeNull();
    const mine = await submit(alice);
    expect((await alice.client.from("privacy_requests").update({ status: "completed" }).eq("id", mine.data.id).select()).data ?? []).toEqual([]);
    expect((await alice.client.from("privacy_request_events").insert({ request_id: mine.data.id, actor_kind: "staff", to_status: "completed" })).error).not.toBeNull();
  });
});

describe("who can see a request", () => {
  let req;
  beforeAll(async () => {
    req = (await submit(alice, { p_subject: "Private matter about me" })).data;
    await handle(officer1, req.id, { p_to_status: "in_progress", p_note_requester: "We are on it.", p_note_internal: "Checked the account, looks genuine." });
  });

  it("the owner sees it and the messages meant for them; staff notes stay hidden", async () => {
    expect((await alice.client.from("privacy_requests").select("id").eq("id", req.id)).data).toHaveLength(1);
    const notes = (await alice.client.from("privacy_request_events").select("note").eq("request_id", req.id)).data.map((e) => e.note);
    expect(notes).toContain("We are on it.");
    expect(notes).not.toContain("Checked the account, looks genuine.");
  });

  it("no other member can see it", async () => {
    expect((await bob.client.from("privacy_requests").select("id").eq("id", req.id)).data).toEqual([]);
    expect((await bob.client.from("privacy_request_events").select("id").eq("request_id", req.id)).data).toEqual([]);
    expect((await anon().from("privacy_requests").select("id")).data ?? []).toEqual([]);
  });

  it("privacy officers see it, with the internal notes", async () => {
    expect((await officer2.client.from("privacy_requests").select("id").eq("id", req.id)).data).toHaveLength(1);
    const notes = (await officer2.client.from("privacy_request_events").select("note").eq("request_id", req.id)).data.map((e) => e.note);
    expect(notes).toContain("Checked the account, looks genuine.");
  });

  it("global administrators and moderators do NOT see privacy requests: privacy access is deliberate", async () => {
    for (const who of [globalAdmin, moderator]) {
      expect((await who.client.from("privacy_requests").select("id").eq("id", req.id)).data).toEqual([]);
      expect((await who.client.rpc("privacy_request_detail", { p_id: req.id })).error?.message).toMatch(/forbidden/);
      expect((await who.client.rpc("list_privacy_requests", {})).error?.message).toMatch(/forbidden/);
      expect((await handle(who, req.id, { p_to_status: "completed", p_note_requester: "done" })).error?.message).toMatch(/forbidden/);
    }
  });

  it("the detail view shows the requester identity to staff and writes an audit entry without the text of the request", async () => {
    const { data } = await officer1.client.rpc("privacy_request_detail", { p_id: req.id });
    expect(data.requester.email).toBe(alice.email);
    const { data: logs } = await admin.from("audit_logs").select("action, target_id, metadata").eq("target_id", req.reference);
    expect(logs.some((l) => l.action === "privacy.request.viewed")).toBe(true);
    expect(JSON.stringify(logs)).not.toMatch(/Private matter about me|typo/);
  });
});

describe("handling", () => {
  it("applies valid transitions, requires a lawful reason when not fully met, and closes for good", async () => {
    const r = (await submit(bob)).data;
    expect((await handle(officer1, r.id, { p_to_status: "rejected" })).error?.message).toMatch(/reason_required/);
    expect((await handle(officer1, r.id, { p_to_status: "partially_completed", p_outcome_reason: "short" })).error?.message).toMatch(/reason_required/);
    expect((await handle(officer1, r.id, { p_to_status: "nonsense" })).error?.message).toMatch(/invalid_decision/);
    expect((await handle(officer1, r.id, { p_to_status: "completed" })).error?.message).toMatch(/reason_required/); // tell the requester what was done
    expect((await handle(officer1, r.id, { p_to_status: "partially_completed", p_outcome_reason: "Moderation records are kept for safety under our policy.", p_note_requester: "Your email was corrected; the rest is explained." })).error).toBeNull();
    const row = await admin.from("privacy_requests").select("status, closed_at, outcome_reason").eq("id", r.id).single();
    expect(row.data.status).toBe("partially_completed");
    expect(row.data.closed_at).not.toBeNull();
    expect(row.data.outcome_reason).toMatch(/kept for safety/);
    expect((await handle(officer2, r.id, { p_to_status: "in_progress" })).error?.message).toMatch(/already_decided/);
  });

  it("will not let staff work on their own request", async () => {
    const own = (await submit(officer1, { p_subject: "My own correction" })).data;
    expect((await handle(officer1, own.id, { p_to_status: "in_progress" })).error?.message).toMatch(/cannot_review_own_request/);
    expect((await handle(officer2, own.id, { p_to_status: "in_progress" })).error).toBeNull();
  });

  it("lets the requester answer a question, which moves the request on", async () => {
    const r = (await submit(alice, { p_subject: "Needs a question" })).data;
    await handle(officer1, r.id, { p_to_status: "awaiting_requester", p_note_requester: "Which email address is wrong?" });
    expect((await bob.client.rpc("add_privacy_request_message", { p_id: r.id, p_message: "Not mine to answer" })).error?.message).toMatch(/not_found/);
    expect((await alice.client.rpc("add_privacy_request_message", { p_id: r.id, p_message: "The one ending in .co" })).error).toBeNull();
    expect((await admin.from("privacy_requests").select("status").eq("id", r.id).single()).data.status).toBe("in_progress");
  });

  it("lets the requester withdraw their own request, and nobody else's", async () => {
    const carol = await createUser("pr-carol");
    const r = (await submit(carol, { p_subject: "Changed my mind" })).data;
    expect((await bob.client.rpc("cancel_my_privacy_request", { p_id: r.id })).error?.message).toMatch(/not_found/);
    expect((await carol.client.rpc("cancel_my_privacy_request", { p_id: r.id })).error).toBeNull();
    expect((await admin.from("privacy_requests").select("status").eq("id", r.id).single()).data.status).toBe("cancelled");
    expect((await carol.client.rpc("cancel_my_privacy_request", { p_id: r.id })).error?.message).toMatch(/invalid_state/);
  });

  it("history cannot be rewritten", async () => {
    const dan = await createUser("pr-dan");
    const r = (await submit(dan, { p_subject: "History test" })).data;
    expect((await admin.from("privacy_request_events").update({ note: "edited" }).eq("request_id", r.id)).error?.message).toMatch(/append-only/);
    expect((await admin.from("privacy_request_events").delete().eq("request_id", r.id)).error?.message).toMatch(/append-only/);
  });

  it("counts open and overdue work for the privacy team only", async () => {
    const { data } = await officer1.client.rpc("privacy_request_counts");
    expect(data.open).toBeGreaterThan(0);
    expect((await alice.client.rpc("privacy_request_counts")).error?.message).toMatch(/forbidden/);
  });
});

describe("grievances from people without an account", () => {
  const code = "ABCD-EFGH-JKLM-NPQR";
  let ref;
  it("get a reference, and nothing is needed but an email address", async () => {
    const { data, error } = await admin.rpc("submit_visitor_grievance", { p_name: "A Visitor", p_email: `Visitor-${tag}@Example.Test`, p_subject: "My photo is still visible", p_details: "I deleted my account but a photo is still visible.", p_tracking_hash: hash("ABCDEFGHJKLMNPQR") });
    expect(error).toBeNull();
    expect(data.reference).toMatch(/^GR-/);
    ref = data.reference;
    const row = await admin.from("privacy_requests").select("channel, contact_email, user_id").eq("reference", ref).single();
    expect(row.data).toEqual({ channel: "visitor", contact_email: `visitor-${tag}@example.test`, user_id: null });
  });

  it("can be followed with the right code only, and the answer never contains what they wrote", async () => {
    const ok = await admin.rpc("track_visitor_grievance", { p_reference: ref, p_tracking_hash: hash("ABCDEFGHJKLMNPQR") });
    expect(ok.data.status).toBe("received");
    expect(JSON.stringify(ok.data)).not.toMatch(/photo|visible|visitor-/i);
    expect((await admin.rpc("track_visitor_grievance", { p_reference: ref, p_tracking_hash: hash("WRONGCODE") })).data).toBeNull();
    expect((await admin.rpc("track_visitor_grievance", { p_reference: "GR-2026-000000", p_tracking_hash: hash("ABCDEFGHJKLMNPQR") })).data).toBeNull();
    expect(code).toHaveLength(19);
  });

  it("can be filed and tracked only through the server, never by the browser", async () => {
    for (const client of [anon(), alice.client]) {
      expect((await client.rpc("submit_visitor_grievance", { p_name: "x", p_email: "a@b.co", p_subject: "Hello", p_details: "Some more than ten", p_tracking_hash: hash("x") })).error).not.toBeNull();
      expect((await client.rpc("track_visitor_grievance", { p_reference: ref, p_tracking_hash: hash("ABCDEFGHJKLMNPQR") })).error).not.toBeNull();
    }
  });

  it("show staff updates to the visitor but not the internal notes", async () => {
    const id = (await admin.from("privacy_requests").select("id").eq("reference", ref).single()).data.id;
    await handle(officer1, id, { p_to_status: "in_progress", p_note_requester: "We found the photo and are removing it.", p_note_internal: "Visitor is not verified; do not confirm which account." });
    const { data } = await admin.rpc("track_visitor_grievance", { p_reference: ref, p_tracking_hash: hash("ABCDEFGHJKLMNPQR") });
    const notes = data.events.map((e) => e.note);
    expect(notes).toContain("We found the photo and are removing it.");
    expect(notes.join(" ")).not.toMatch(/not verified/);
  });

  it("refuses bad input and an address that already has several open grievances", async () => {
    const base = { p_name: "", p_subject: "Hello there", p_details: "Some more than ten characters", p_tracking_hash: hash("y".repeat(10)) };
    expect((await admin.rpc("submit_visitor_grievance", { ...base, p_email: "not-an-email" })).error?.message).toMatch(/invalid_email/);
    expect((await admin.rpc("submit_visitor_grievance", { ...base, p_email: "a@b.co", p_tracking_hash: "short" })).error?.message).toMatch(/invalid_key/);
    for (let i = 0; i < 3; i++) await admin.rpc("submit_visitor_grievance", { ...base, p_email: `repeat-${tag}@example.test`, p_subject: `Hello there ${i}` });
    expect((await admin.rpc("submit_visitor_grievance", { ...base, p_email: `repeat-${tag}@example.test` })).error?.message).toMatch(/too_many_open/);
  });
});

describe("nomination", () => {
  it("is stored for the member, visible to them and to the privacy team, and logged as a completed request", async () => {
    const { data, error } = await alice.client.rpc("set_my_nomination", { p_name: "Meera Sharma", p_email: "meera@example.test", p_relationship: "Sister" });
    expect(error).toBeNull();
    expect(data.reference).toMatch(/^PR-/);
    expect((await alice.client.from("privacy_nominations").select("nominee_name")).data).toEqual([{ nominee_name: "Meera Sharma" }]);
    expect((await bob.client.from("privacy_nominations").select("nominee_name")).data).toEqual([]);
    expect((await officer1.client.from("privacy_nominations").select("user_id").eq("user_id", alice.id)).data).toHaveLength(1);
    expect((await globalAdmin.client.from("privacy_nominations").select("user_id").eq("user_id", alice.id)).data).toEqual([]);
    expect((await admin.from("privacy_requests").select("status").eq("reference", data.reference).single()).data.status).toBe("completed");
  });

  it("replaces the previous nomination, and can be removed", async () => {
    await alice.client.rpc("set_my_nomination", { p_name: "Ravi Sharma", p_email: "ravi@example.test", p_relationship: "" });
    expect((await alice.client.from("privacy_nominations").select("nominee_name")).data).toEqual([{ nominee_name: "Ravi Sharma" }]);
    expect((await alice.client.rpc("revoke_my_nomination")).error).toBeNull();
    expect((await alice.client.from("privacy_nominations").select("nominee_name")).data).toEqual([]);
    expect((await alice.client.rpc("revoke_my_nomination")).error?.message).toMatch(/not_found/);
  });

  it("rejects an invalid or self-referential nominee", async () => {
    expect((await alice.client.rpc("set_my_nomination", { p_name: "R", p_email: "ravi@example.test", p_relationship: "" })).error?.message).toMatch(/invalid_name/);
    expect((await alice.client.rpc("set_my_nomination", { p_name: "Ravi", p_email: "nope", p_relationship: "" })).error?.message).toMatch(/invalid_email/);
    expect((await alice.client.rpc("set_my_nomination", { p_name: "Myself", p_email: alice.email, p_relationship: "" })).error?.message).toMatch(/invalid_email/);
  });
});

describe("granting the privacy officer role", () => {
  it("is for global administrators, platform-wide, and never to oneself", async () => {
    const target = await createUser("pr-target");
    expect((await moderator.client.rpc("grant_role", { p_user: target.id, p_role: "privacy_officer", p_college: null })).error?.message).toMatch(/forbidden/);
    expect((await globalAdmin.client.rpc("grant_role", { p_user: globalAdmin.id, p_role: "privacy_officer", p_college: null })).error?.message).toMatch(/cannot_grant_to_self/);
    expect((await globalAdmin.client.rpc("grant_role", { p_user: target.id, p_role: "privacy_officer", p_college: "00000000-0000-4000-8000-000000000001" })).error?.message).toMatch(/invalid_scope/);
    expect((await globalAdmin.client.rpc("grant_role", { p_user: target.id, p_role: "privacy_officer", p_college: null })).error).toBeNull();
    // Holding the role gives access to privacy records, and only that.
    expect((await target.client.rpc("privacy_request_counts")).error).toBeNull();
    expect((await target.client.rpc("list_reports", { p_status: "open", p_limit: 1 })).data ?? []).toEqual([]);
  });

  it("is not part of any default role: the privacy permissions belong to privacy_officer alone", async () => {
    const { data } = await admin.from("role_permissions").select("role, permission").like("permission", "privacy.%");
    expect([...new Set(data.map((r) => r.role))]).toEqual(["privacy_officer"]);
  });
});

describe("privacy settings", () => {
  it("cannot be changed through the generic settings door, or by administrators", async () => {
    expect((await globalAdmin.client.rpc("set_system_setting", { p_key: "privacy_review_mode", p_value: "required" })).error?.message).toMatch(/forbidden/);
    expect((await globalAdmin.client.rpc("set_privacy_setting", { p_key: "privacy_review_mode", p_value: "required" })).error?.message).toMatch(/forbidden/);
  });
  it("can be changed by a privacy officer, with an audit entry, except the cutover date", async () => {
    expect((await officer1.client.rpc("set_privacy_setting", { p_key: "privacy_incident_self_approval", p_value: false })).error).toBeNull();
    expect((await officer1.client.rpc("set_privacy_setting", { p_key: "privacy_cutover_at", p_value: "2030-01-01T00:00:00Z" })).error?.message).toMatch(/forbidden/);
    expect((await officer1.client.rpc("set_privacy_setting", { p_key: "platform_name", p_value: "x" })).error?.message).toMatch(/forbidden/);
    expect((await admin.from("audit_logs").select("action").eq("action", "privacy.setting.updated").limit(1)).data).toHaveLength(1);
  });
  it("are not readable by members or visitors", async () => {
    // privacy_md is the older, public policy-override setting; every setting the privacy team uses is private.
    const mine = (r) => (r.data ?? []).map((x) => x.key).filter((k) => k !== "privacy_md");
    expect(mine(await alice.client.from("system_settings").select("key").like("key", "privacy_%"))).toEqual([]);
    expect(mine(await anon().from("system_settings").select("key").like("key", "privacy_%"))).toEqual([]);
  });
});
