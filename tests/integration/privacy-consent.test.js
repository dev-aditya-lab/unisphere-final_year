import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, anon, cleanupUsers, createUser } from "../helpers/supabase.js";

/** Consent records: who can write them, what they remember, and what they switch on and off. */
let alice, bob;
// A version number of its own: the real one is archived by the app with its real hash, and archived rows can never be removed.
const V = "2099-01-01.1";
const record = (userId, purpose, status, source = "settings", version = V) =>
  admin.rpc("record_consent_for", { p_user: userId, p_purpose: purpose, p_status: status, p_notice_version: version, p_source: source });

beforeAll(async () => {
  alice = await createUser("consent-alice");
  bob = await createUser("consent-bob");
  // The archive row consent records point at (the app publishes it on first use).
  await admin.rpc("publish_privacy_notice", {
    p_version: V, p_effective_at: "2026-10-21T00:00:00+05:30", p_hash: "test-hash-" + V, p_purposes: [], p_document: { policy: [] }, p_reconsent: [], p_summary: "test",
  }).then(() => {}, () => {});
});
afterAll(cleanupUsers);

describe("who can write consent", () => {
  it("only the server can: members and visitors are refused", async () => {
    const asMember = await alice.client.rpc("record_consent_for", { p_user: alice.id, p_purpose: "ai_assist", p_status: "granted", p_notice_version: V, p_source: "settings" });
    expect(asMember.error?.message).toMatch(/permission denied/i);
    const asVisitor = await anon().rpc("record_consent_for", { p_user: alice.id, p_purpose: "ai_assist", p_status: "granted", p_notice_version: V, p_source: "settings" });
    expect(asVisitor.error?.message).toMatch(/permission denied/i);
  });

  it("members cannot insert, update or delete consent rows directly", async () => {
    expect((await alice.client.from("consent_current").insert({ user_id: alice.id, purpose: "ai_assist", status: "granted", notice_version: V })).error).not.toBeNull();
    await record(alice.id, "ai_assist", "granted");
    const upd = await alice.client.from("consent_current").update({ status: "withdrawn" }).eq("user_id", alice.id).select();
    expect(upd.data ?? []).toEqual([]);
    const del = await alice.client.from("consent_current").delete().eq("user_id", alice.id).select();
    expect(del.data ?? []).toEqual([]);
    expect((await alice.client.from("consent_events").insert({ user_id: alice.id, purpose: "ai_assist", status: "granted", notice_version: V, source: "settings" })).error).not.toBeNull();
  });

  it("a member reads only their own consent state and history", async () => {
    await record(bob.id, "ai_assist", "granted");
    const mine = await alice.client.from("consent_current").select("user_id");
    expect(mine.data.every((r) => r.user_id === alice.id)).toBe(true);
    const theirs = await alice.client.from("consent_events").select("user_id");
    expect(theirs.data.every((r) => r.user_id === alice.id)).toBe(true);
    expect((await anon().from("consent_current").select("user_id")).data ?? []).toEqual([]);
  });
});

describe("recording and withdrawing", () => {
  it("keeps the current choice and an auditable history with the notice version and source", async () => {
    const carol = await createUser("consent-carol");
    await record(carol.id, "ai_assist", "granted", "feature_prompt");
    await record(carol.id, "ai_assist", "withdrawn", "settings");
    await record(carol.id, "ai_assist", "granted", "settings");
    const { data: now } = await admin.from("consent_current").select("status, notice_version").eq("user_id", carol.id).eq("purpose", "ai_assist").single();
    expect(now).toEqual({ status: "granted", notice_version: V });
    const { data: events } = await admin.from("consent_events").select("status, source, notice_version").eq("user_id", carol.id).order("id");
    expect(events.map((e) => e.status)).toEqual(["granted", "withdrawn", "granted"]);
    expect(events.map((e) => e.source)).toEqual(["feature_prompt", "settings", "settings"]);
    expect(events.every((e) => e.notice_version === V)).toBe(true);
  });

  it("records nothing for a repeat of the same choice under the same notice", async () => {
    const dave = await createUser("consent-dave");
    expect((await record(dave.id, "ai_assist", "granted")).data.changed).toBe(true);
    expect((await record(dave.id, "ai_assist", "granted")).data.changed).toBe(false);
    const { count } = await admin.from("consent_events").select("id", { count: "exact", head: true }).eq("user_id", dave.id);
    expect(count).toBe(1);
  });

  it("keeps purposes independent: withdrawing one leaves the others alone", async () => {
    const erin = await createUser("consent-erin");
    await record(erin.id, "ai_assist", "granted");
    await record(erin.id, "ai_discovery_index", "granted");
    await record(erin.id, "ai_assist", "withdrawn");
    const { data } = await admin.from("consent_current").select("purpose, status").eq("user_id", erin.id);
    expect(Object.fromEntries(data.map((r) => [r.purpose, r.status]))).toEqual({ ai_assist: "withdrawn", ai_discovery_index: "granted" });
  });

  it("refuses unknown purposes, statuses, sources and notice versions", async () => {
    expect((await record(alice.id, "marketing", "granted")).error?.message).toMatch(/unknown_purpose/);
    expect((await record(alice.id, "ai_assist", "maybe")).error?.message).toMatch(/invalid_status/);
    expect((await record(alice.id, "ai_assist", "granted", "telepathy")).error?.message).toMatch(/invalid_source/);
    expect((await record(alice.id, "ai_assist", "granted", "settings", "1999-01-01.1")).error?.message).toMatch(/unknown_notice_version/);
  });

  it("will not withdraw the consent the account rests on: that is account deletion", async () => {
    await record(alice.id, "core_service", "granted", "signup");
    expect((await record(alice.id, "core_service", "withdrawn")).error?.message).toMatch(/use_account_deletion/);
    expect((await record(alice.id, "age_confirmation", "withdrawn")).error?.message).toMatch(/invalid_status/);
    const { data } = await admin.from("consent_current").select("status").eq("user_id", alice.id).eq("purpose", "core_service").single();
    expect(data.status).toBe("granted");
  });

  it("does not corrupt the state when two tabs change the same choice at once", async () => {
    const fay = await createUser("consent-fay");
    await Promise.all([record(fay.id, "ai_assist", "granted"), record(fay.id, "ai_assist", "withdrawn"), record(fay.id, "ai_assist", "granted"), record(fay.id, "ai_assist", "withdrawn")]);
    const { data: now } = await admin.from("consent_current").select("status").eq("user_id", fay.id).eq("purpose", "ai_assist");
    expect(now).toHaveLength(1);
    const { data: events } = await admin.from("consent_events").select("status").eq("user_id", fay.id).order("id");
    // The last recorded event is the current state, whatever the order they ran in.
    expect(events.at(-1).status).toBe(now[0].status);
  });
});

describe("what a choice switches", () => {
  it("keeps profiles.ai_assist_enabled in step with the ai_assist consent", async () => {
    const gus = await createUser("consent-gus");
    expect((await admin.from("profiles").select("ai_assist_enabled").eq("id", gus.id).single()).data.ai_assist_enabled).toBe(false);
    await record(gus.id, "ai_assist", "granted");
    expect((await admin.from("profiles").select("ai_assist_enabled").eq("id", gus.id).single()).data.ai_assist_enabled).toBe(true);
    await record(gus.id, "ai_assist", "withdrawn");
    expect((await admin.from("profiles").select("ai_assist_enabled").eq("id", gus.id).single()).data.ai_assist_enabled).toBe(false);
  });

  it("new accounts start with AI off (nothing is on by default)", async () => {
    const hal = await createUser("consent-hal");
    expect((await admin.from("profiles").select("ai_assist_enabled").eq("id", hal.id).single()).data.ai_assist_enabled).toBe(false);
    expect((await admin.rpc("has_consent", { p_user: hal.id, p_purpose: "ai_assist" })).data).toBe(false);
  });

  it("deletes the AI index of a member's content when they withdraw AI indexing", async () => {
    const ira = await createUser("consent-ira");
    const vec = `[${Array(768).fill(0.01).join(",")}]`;
    await admin.from("embeddings").upsert({ entity_type: "profile", entity_id: ira.id, embedding: vec, content_hash: "h", model: "m" }, { onConflict: "entity_type,entity_id" });
    await record(ira.id, "ai_discovery_index", "granted");
    expect((await admin.from("embeddings").select("entity_id").eq("entity_id", ira.id)).data).toHaveLength(1);
    await record(ira.id, "ai_discovery_index", "withdrawn");
    expect((await admin.from("embeddings").select("entity_id").eq("entity_id", ira.id)).data).toEqual([]);
  });
});

describe("history is append-only and survives erasure without identifying anyone", () => {
  it("cannot be edited or deleted", async () => {
    const jo = await createUser("consent-jo");
    await record(jo.id, "ai_assist", "granted");
    const upd = await admin.from("consent_events").update({ status: "withdrawn" }).eq("user_id", jo.id);
    expect(upd.error?.message).toMatch(/append-only/);
    const del = await admin.from("consent_events").delete().eq("user_id", jo.id);
    expect(del.error?.message).toMatch(/append-only/);
  });

  it("loses its link to the member when the account is erased, and keeps nothing else about them", async () => {
    const kay = await createUser("consent-kay");
    await record(kay.id, "ai_assist", "granted");
    const { data: before } = await admin.from("consent_events").select("id").eq("user_id", kay.id);
    expect(before).toHaveLength(1);
    await admin.auth.admin.deleteUser(kay.id);
    const { data: after } = await admin.from("consent_events").select("user_id, purpose, status").eq("id", before[0].id).single();
    expect(after.user_id).toBeNull();
    expect((await admin.from("consent_current").select("user_id").eq("user_id", kay.id)).data).toEqual([]);
  });
});

describe("notice versions", () => {
  it("are public documents, immutable, and never reused for different content", async () => {
    expect((await anon().from("privacy_notice_versions").select("version").eq("version", V)).data).toHaveLength(1);
    expect((await admin.from("privacy_notice_versions").update({ summary: "edited" }).eq("version", V)).error?.message).toMatch(/append-only/);
    expect((await admin.from("privacy_notice_versions").delete().eq("version", V)).error?.message).toMatch(/append-only/);
    const again = await admin.rpc("publish_privacy_notice", { p_version: V, p_effective_at: "2026-10-21T00:00:00+05:30", p_hash: "a-different-hash", p_purposes: [], p_document: {}, p_reconsent: [], p_summary: "x" });
    expect(again.error?.message).toMatch(/notice_version_content_changed/);
    const same = await admin.rpc("publish_privacy_notice", { p_version: V, p_effective_at: "2026-10-21T00:00:00+05:30", p_hash: "test-hash-" + V, p_purposes: [], p_document: {}, p_reconsent: [], p_summary: "x" });
    expect(same.data).toBe("exists");
    expect((await alice.client.rpc("publish_privacy_notice", { p_version: "2030-01-01.1", p_effective_at: "2030-01-01T00:00:00Z", p_hash: "h", p_purposes: [], p_document: {}, p_reconsent: [], p_summary: "x" })).error).not.toBeNull();
  });
});
