import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { admin, anon, cleanupUsers, createUser, grantRoleDirect } from "../helpers/supabase.js";

/**
 * Account erasure end to end, against the local database: the request (with its own record), the retry-safe execution,
 * what is removed, what is kept and why, the ledger that stops a restored backup bringing an account back, and the
 * retention job. File storage is replaced by a fake that can be made to fail, so partial failure can be exercised.
 */
const storage = { fail: false, deleted: [] };
vi.mock("@/lib/storage/r2", () => ({
  deleteObject: async ({ key }) => {
    if (storage.fail) throw Object.assign(new Error("storage down"), { $metadata: { httpStatusCode: 503 } });
    storage.deleted.push(key);
  },
}));
vi.mock("@/lib/env", async (orig) => {
  const m = await orig();
  return { ...m, getIntegrations: () => ({ ...m.getIntegrations(), r2: true }) };
});
const { executeAccountDeletion, processDueDeletions } = await import("@/lib/services/account-deletion");
const { buildDataExport } = await import("@/lib/privacy/export");

const V = "2099-01-01.1";
const request = (userId, { reason = "", eraseMessages = false } = {}) =>
  admin.rpc("request_account_deletion_for", { p_user: userId, p_reason: reason, p_erase_messages: eraseMessages });
const slug = () => `t-${Math.random().toString(36).slice(2, 8)}`;

let officer;
beforeAll(async () => {
  officer = await createUser("er-officer");
  await grantRoleDirect(officer.id, "privacy_officer");
  await admin.rpc("publish_privacy_notice", { p_version: V, p_effective_at: "2026-10-21T00:00:00+05:30", p_hash: "test-hash-" + V, p_purposes: [], p_document: {}, p_reconsent: [], p_summary: "test" }).then(() => {}, () => {});
});
beforeEach(() => {
  storage.fail = false;
  storage.deleted = [];
});
afterAll(cleanupUsers);

/** A member with a bit of everything the erasure has to deal with. */
async function populate(label) {
  const u = await createUser(label, { consent: false });
  const friend = await createUser(`${label}-friend`, { consent: false });
  await admin.from("profiles").update({ allow_messages_from: "everyone" }).in("id", [u.id, friend.id]);
  await admin.rpc("record_consent_for", { p_user: u.id, p_purpose: "ai_discovery_index", p_status: "granted", p_notice_version: V, p_source: "settings" });
  const post = (await u.client.from("posts").insert({ author_id: u.id, slug: slug(), body: "My idea for a campus app", visibility: "public" }).select("id").single()).data;
  const file = (await admin.from("files").insert({ owner_id: u.id, bucket: "private", storage_key: `post_attachment/${u.id}/${crypto.randomUUID()}.png`, purpose: "post_attachment", mime_type: "image/png", size_bytes: 10, status: "ready" }).select("id, storage_key").single()).data;
  const vec = `[${Array(768).fill(0.02).join(",")}]`;
  await admin.from("embeddings").insert({ entity_type: "post", entity_id: post.id, embedding: vec, content_hash: "h", model: "m" });
  await admin.from("embeddings").upsert({ entity_type: "profile", entity_id: u.id, embedding: vec, content_hash: "h", model: "m" }, { onConflict: "entity_type,entity_id" });
  const conv = (await u.client.rpc("start_direct_conversation", { p_other: friend.id })).data;
  const sent = (await u.client.rpc("send_message", { p_conversation: conv, p_body: "hello from the person who will leave", p_file_ids: [], p_client_op_id: crypto.randomUUID() })).data.message;
  return { u, friend, post, file, conv, sent };
}

describe("asking for erasure", () => {
  it("is done by the server on the member's behalf, with a request record the member can follow", async () => {
    const m = await createUser("er-ask");
    const { data, error } = await request(m.id, { reason: "leaving", eraseMessages: true });
    expect(error).toBeNull();
    expect(data.reference).toMatch(/^PR-\d{4}-\d{6}$/);
    expect((Date.parse(data.scheduled_for) - Date.now()) / 86400000).toBeGreaterThan(13.9);
    const mine = await m.client.from("privacy_requests").select("kind, status, reference").eq("kind", "erasure");
    expect(mine.data).toEqual([{ kind: "erasure", status: "in_progress", reference: data.reference }]);
    const { data: del } = await admin.from("account_deletion_requests").select("status, erase_messages, privacy_request_id").eq("user_id", m.id).single();
    expect(del).toMatchObject({ status: "pending", erase_messages: true });
    expect(del.privacy_request_id).not.toBeNull();
  });

  it("cannot be created, changed or forged from the browser", async () => {
    const m = await createUser("er-forge");
    expect((await m.client.rpc("request_account_deletion_for", { p_user: m.id, p_reason: "", p_erase_messages: false })).error?.message).toMatch(/permission denied/i);
    expect((await anon().rpc("request_account_deletion_for", { p_user: m.id, p_reason: "", p_erase_messages: false })).error).not.toBeNull();
    expect((await m.client.from("account_deletion_requests").insert({ user_id: m.id, reason: "x" })).error).not.toBeNull();
    await request(m.id);
    expect((await m.client.from("account_deletion_requests").update({ scheduled_for: new Date(0).toISOString() }).eq("user_id", m.id).select()).data ?? []).toEqual([]);
    expect((await m.client.from("account_deletion_requests").update({ status: "cancelled" }).eq("user_id", m.id).select()).data ?? []).toEqual([]);
  });

  it("is refused twice, and for staff accounts until the role is removed", async () => {
    const m = await createUser("er-twice");
    expect((await request(m.id)).error).toBeNull();
    expect((await request(m.id)).error?.message).toMatch(/duplicate/);
    expect((await request(officer.id)).error?.message).toMatch(/protected_account/);
  });

  it("can be cancelled by the member, which closes the request too, and then asked for again", async () => {
    const m = await createUser("er-cancel");
    await request(m.id);
    expect((await m.client.rpc("cancel_my_account_deletion")).error).toBeNull();
    const { data } = await admin.from("privacy_requests").select("status").eq("user_id", m.id).eq("kind", "erasure").single();
    expect(data.status).toBe("cancelled");
    expect((await m.client.rpc("cancel_my_account_deletion")).error?.message).toMatch(/not_found/);
    expect((await request(m.id)).error).toBeNull();
  });

  it("is not picked up by the worker before the 14 days are over", async () => {
    const m = await createUser("er-wait");
    await request(m.id);
    expect((await admin.rpc("claim_due_deletions", { p_limit: 50 })).data.some((r) => r.user_id === m.id)).toBe(false);
    await admin.from("account_deletion_requests").update({ scheduled_for: new Date(Date.now() - 1000).toISOString() }).eq("user_id", m.id);
    const claimed = (await admin.rpc("claim_due_deletions", { p_limit: 50 })).data.find((r) => r.user_id === m.id);
    expect(claimed).toBeTruthy();
    // Just claimed: a second worker does not take it again straight away.
    expect((await admin.rpc("claim_due_deletions", { p_limit: 50 })).data.some((r) => r.user_id === m.id)).toBe(false);
  });
});

describe("executing the erasure", () => {
  it("removes the account, files, derived data and records, and says what was kept", async () => {
    const { u, friend, post, file, sent } = await populate("er-full");
    await admin.from("blue_tick_orders").insert({ user_id: u.id, payer_username: u.username, provider: "test", provider_order_id: `order_${slug()}`, amount_paise: 49900, status: "paid" });
    const { data: req } = await request(u.id);
    await admin.from("account_deletion_requests").update({ status: "processing" }).eq("user_id", u.id);

    const res = await executeAccountDeletion(u.id);
    expect(res.ok).toBe(true);

    expect((await admin.auth.admin.getUserById(u.id)).data.user).toBeNull();
    expect((await admin.from("profiles").select("id").eq("id", u.id)).data).toEqual([]);
    expect((await admin.from("posts").select("id").eq("id", post.id)).data).toEqual([]);
    expect((await admin.from("files").select("id").eq("owner_id", u.id)).data).toEqual([]);
    expect(storage.deleted).toContain(file.storage_key);
    expect((await admin.from("embeddings").select("entity_id").in("entity_id", [post.id, u.id])).data).toEqual([]);
    expect((await admin.from("consent_current").select("user_id").eq("user_id", u.id)).data).toEqual([]);

    // Kept, with a reason: the payment record (no link to the person left) and the message already delivered to a friend.
    const { data: order } = await admin.from("blue_tick_orders").select("user_id, amount_paise").eq("amount_paise", 49900).order("created_at", { ascending: false }).limit(1).single();
    expect(order.user_id).toBeNull();
    const { data: msg } = await admin.from("messages").select("sender_id, body, status").eq("id", sent.id).single();
    expect(msg).toMatchObject({ sender_id: null, status: "sent" });
    expect((await friend.client.from("profiles").select("id").eq("id", friend.id)).data).toHaveLength(1);

    // The member's request ends honestly: partly completed, with the reasons; and the ledger knows.
    const { data: pr } = await admin.from("privacy_requests").select("status, outcome_reason, user_id, closed_at").eq("reference", req.reference).single();
    expect(pr.status).toBe("partially_completed");
    expect(pr.outcome_reason).toMatch(/payment records/);
    expect(pr.outcome_reason).toMatch(/messages already delivered/);
    expect(pr.user_id).toBeNull();
    expect(pr.closed_at).not.toBeNull();
    const { data: ledger } = await admin.from("erasure_ledger").select("status, request_reference").eq("user_ref", u.id).single();
    expect(ledger).toEqual({ status: "completed", request_reference: req.reference });
    // The audit log keeps the opaque id only.
    const { data: audit } = await admin.from("audit_logs").select("action, target_id, metadata").eq("target_id", u.id).eq("action", "account.deleted");
    expect(audit).toHaveLength(1);
    expect(JSON.stringify(audit)).not.toMatch(/hello from the person|@example\.test/);
  });

  it("blanks the messages the member chose to erase, for everyone, and keeps nothing of their text", async () => {
    const { u, sent, conv } = await populate("er-msgs");
    await request(u.id, { eraseMessages: true });
    await admin.from("account_deletion_requests").update({ status: "processing" }).eq("user_id", u.id);
    expect((await executeAccountDeletion(u.id)).ok).toBe(true);
    const { data: msg } = await admin.from("messages").select("body, status, sender_id").eq("id", sent.id).single();
    expect(msg).toEqual({ body: "", status: "deleted", sender_id: null });
    expect(conv).toBeTruthy();
    const { data: pr } = await admin.from("privacy_requests").select("status").eq("kind", "erasure").is("user_id", null).order("created_at", { ascending: false }).limit(1).single();
    expect(["completed", "partially_completed"]).toContain(pr.status);
  });

  it("never reports completion until the data is gone: a storage failure leaves everything in place and is retried", async () => {
    const { u, file } = await populate("er-fail");
    await request(u.id);
    await admin.from("account_deletion_requests").update({ status: "processing" }).eq("user_id", u.id);

    storage.fail = true;
    const failed = await executeAccountDeletion(u.id);
    expect(failed.ok).toBe(false);
    expect(failed.code).toBe("storage");
    // Nothing was removed, nothing was reported as done.
    expect((await admin.auth.admin.getUserById(u.id)).data.user).not.toBeNull();
    expect((await admin.from("files").select("id").eq("id", file.id)).data).toHaveLength(1);
    const { data: del } = await admin.from("account_deletion_requests").select("status, last_error").eq("user_id", u.id).single();
    expect(del.status).toBe("processing");
    expect(del.last_error).toMatch(/storage/);
    const { data: pr } = await admin.from("privacy_requests").select("status").eq("user_id", u.id).eq("kind", "erasure").single();
    expect(pr.status).toBe("in_progress");
    // The request shows the member nothing alarming; the failure note is staff-only.
    const memberNotes = (await u.client.from("privacy_request_events").select("note")).data.map((e) => e.note ?? "");
    expect(memberNotes.join(" ")).not.toMatch(/failed/i);
    expect((await admin.from("erasure_ledger").select("status").eq("user_ref", u.id).single()).data.status).toBe("started");

    // Storage comes back; the retry finishes the job and is safe to run twice.
    storage.fail = false;
    expect((await executeAccountDeletion(u.id)).ok).toBe(true);
    expect((await admin.auth.admin.getUserById(u.id)).data.user).toBeNull();
    expect((await executeAccountDeletion(u.id)).ok).toBe(true);
    expect((await admin.from("erasure_ledger").select("status").eq("user_ref", u.id).single()).data.status).toBe("completed");
  });

  it("is picked up by the worker once due, and a stuck erasure backs off instead of hammering", async () => {
    const m = await createUser("er-worker");
    await request(m.id);
    await admin.from("account_deletion_requests").update({ scheduled_for: new Date(Date.now() - 1000).toISOString() }).eq("user_id", m.id);
    const out = await processDueDeletions({ limit: 50 });
    expect(out.claimed).toBeGreaterThanOrEqual(1);
    expect((await admin.auth.admin.getUserById(m.id)).data.user).toBeNull();

    const stuck = await createUser("er-stuck");
    await request(stuck.id);
    await admin.from("account_deletion_requests").update({ status: "processing", attempts: 3, last_attempt_at: new Date().toISOString() }).eq("user_id", stuck.id);
    expect((await admin.rpc("claim_due_deletions", { p_limit: 50 })).data.some((r) => r.user_id === stuck.id)).toBe(false);
    await admin.from("account_deletion_requests").update({ last_attempt_at: new Date(Date.now() - 3600_000).toISOString() }).eq("user_id", stuck.id);
    expect((await admin.rpc("claim_due_deletions", { p_limit: 50 })).data.some((r) => r.user_id === stuck.id)).toBe(true);
    await admin.from("account_deletion_requests").update({ attempts: 25, last_attempt_at: new Date(0).toISOString() }).eq("user_id", stuck.id);
    expect((await admin.rpc("claim_due_deletions", { p_limit: 50 })).data.some((r) => r.user_id === stuck.id)).toBe(false); // given up, left visible for staff
  });

  it("does not resurrect: the ledger lists the erased account, and finishes paperwork a crash left behind", async () => {
    const m = await createUser("er-crash");
    const { data: req } = await request(m.id);
    await admin.from("account_deletion_requests").update({ status: "processing" }).eq("user_id", m.id);
    await admin.rpc("begin_account_erasure", { p_user: m.id, p_request: (await admin.from("privacy_requests").select("id").eq("reference", req.reference).single()).data.id });
    // The process died right after the sign-in account was removed, before the request was closed.
    await admin.auth.admin.deleteUser(m.id);
    const { data: stale } = await admin.from("privacy_requests").select("status, user_id").eq("reference", req.reference).single();
    expect(stale).toEqual({ status: "in_progress", user_id: null });
    expect((await admin.rpc("run_privacy_retention", { p_force: true })).data.erasures_reconciled).toBeGreaterThanOrEqual(1);
    expect((await admin.from("privacy_requests").select("status").eq("reference", req.reference).single()).data.status).toBe("completed");
    expect((await admin.from("erasure_ledger").select("status").eq("user_ref", m.id).single()).data.status).toBe("completed");
  });

  it("keeps the ledger private to the privacy team", async () => {
    const m = await createUser("er-ledger");
    expect((await m.client.from("erasure_ledger").select("user_ref")).data).toEqual([]);
    expect((await officer.client.from("erasure_ledger").select("user_ref")).error).toBeNull();
    expect((await m.client.rpc("run_privacy_retention", { p_force: true })).error).not.toBeNull();
    expect((await m.client.rpc("begin_account_erasure", { p_user: m.id, p_request: null })).error).not.toBeNull();
  });
});

describe("retention", () => {
  it("anonymises old closed requests, deletes old resolved support mail and logs, and leaves recent ones alone", async () => {
    const m = await createUser("er-ret");
    const old = (await m.client.rpc("submit_privacy_request", { p_kind: "other", p_subject: "An old request", p_details: "Some personal details I wrote down long ago." })).data;
    const fresh = (await m.client.rpc("submit_privacy_request", { p_kind: "other", p_subject: "A fresh request", p_details: "Some personal details I wrote down today." })).data;
    for (const r of [old, fresh]) await officer.client.rpc("staff_update_privacy_request", { p_id: r.id, p_to_status: "completed", p_note_requester: "Answered by email.", p_note_internal: "Spoke to the member", p_outcome_reason: null, p_assign: null });
    await admin.from("privacy_requests").update({ closed_at: new Date(Date.now() - 400 * 86400000).toISOString() }).eq("id", old.id);

    const oldMsg = (await admin.from("contact_messages").insert({ name: "Old", email: "old@example.test", subject: "General", message: "An old resolved message", status: "resolved", created_at: new Date(Date.now() - 400 * 86400000).toISOString() }).select("id").single()).data;
    const openMsg = (await admin.from("contact_messages").insert({ name: "Open", email: "open@example.test", subject: "General", message: "An old but still open message", status: "new", created_at: new Date(Date.now() - 400 * 86400000).toISOString() }).select("id").single()).data;
    const oldLog = (await admin.from("ai_usage_logs").insert({ task: "suggest_tags", status: "success", created_at: new Date(Date.now() - 400 * 86400000).toISOString() }).select("id").single()).data;

    const out = (await admin.rpc("run_privacy_retention", { p_force: true })).data;
    expect(out.requests_anonymised).toBeGreaterThanOrEqual(1);

    const o = (await admin.from("privacy_requests").select("subject, details, anonymised_at, status, reference").eq("id", old.id).single()).data;
    expect(o.details).toBeNull();
    expect(o.subject).toMatch(/details removed/);
    expect(o.anonymised_at).not.toBeNull();
    expect(o.status).toBe("completed"); // accountability record kept
    const notes = (await admin.from("privacy_request_events").select("note, actor_kind").eq("request_id", old.id)).data.filter((e) => e.actor_kind !== "system");
    expect(notes.every((e) => e.note === null)).toBe(true);
    const f = (await admin.from("privacy_requests").select("details, anonymised_at").eq("id", fresh.id).single()).data;
    expect(f.details).toMatch(/today/);
    expect(f.anonymised_at).toBeNull();

    expect((await admin.from("contact_messages").select("id").eq("id", oldMsg.id)).data).toEqual([]);
    expect((await admin.from("contact_messages").select("id").eq("id", openMsg.id)).data).toHaveLength(1);
    expect((await admin.from("ai_usage_logs").select("id").eq("id", oldLog.id)).data).toEqual([]);
    await admin.from("contact_messages").delete().eq("id", openMsg.id);
  });

  it("is throttled when run by the worker, and cannot be run by members", async () => {
    await admin.rpc("run_privacy_retention", { p_force: true });
    expect((await admin.rpc("run_privacy_retention", { p_force: false })).data).toEqual({ skipped: true });
  });
});

describe("a copy of my data", () => {
  it("contains the member's own records and an explanation of the processing, and no one else's", async () => {
    const { u, friend } = await populate("er-export");
    await admin.from("ai_usage_logs").insert({ user_id: u.id, task: "suggest_tags", status: "success" });
    await admin.rpc("record_consent_for", { p_user: u.id, p_purpose: "ai_assist", p_status: "granted", p_notice_version: V, p_source: "settings" });
    await admin.from("push_subscriptions").insert({ user_id: u.id, endpoint: "https://push.example.test/secret-endpoint", p256dh: "k-secret", auth: "a-secret" });
    await admin.from("push_devices").insert({ user_id: u.id, platform: "android", token: "fcm-secret-token-0123456789abcdef" });
    const body = await buildDataExport(u.client, { id: u.id, email: u.email, created_at: new Date().toISOString() });
    expect(body.account.email).toBe(u.email);
    expect(body.posts).toHaveLength(1);
    expect(body.messages_you_sent).toHaveLength(1);
    expect(body.consents.current.map((c) => c.purpose).sort()).toEqual(["ai_assist", "ai_discovery_index"]);
    expect(body.ai_usage_metadata).toHaveLength(1);
    expect(body.how_your_data_is_used.data_collected.length).toBeGreaterThan(5);
    expect(body.how_your_data_is_used.service_providers.some((p) => p.name === "Supabase")).toBe(true);
    expect(body.not_included.length).toBeGreaterThan(2);
    const text = JSON.stringify(body);
    expect(text).not.toContain(friend.email);
    expect(text).not.toContain(friend.username);
    expect(text).not.toMatch(/secret-endpoint|k-secret|a-secret|fcm-secret-token/);
    // The Android app's phones are listed (when added, last used) but never by token.
    expect(body.android_app_devices_registered_for_push).toHaveLength(1);
    expect(body.incomplete_sections ?? []).toEqual([]);
  });
});
