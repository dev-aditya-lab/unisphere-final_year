import "server-only";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getIntegrations } from "@/lib/env";
import { deleteObject } from "@/lib/storage/r2";
import { fail, ok } from "@/lib/actions/result";
import { sendEmail } from "@/lib/email";
import { accountErasedEmail } from "@/lib/email/templates";

/**
 * Permanent account erasure. It runs only after the 14-day grace period (worker) or a staff member's approval (admin
 * console), and it is safe to run again after any failure: every step either finishes or leaves the account exactly
 * where the next attempt can pick it up. Nothing is reported as complete until the sign-in account is really gone.
 *
 *   1. begin     open the erasure ledger entry and work out which records must be kept, and why (before deleting)
 *   2. storage   remove every stored object the member owns, public and private (a failure stops here and is retried)
 *   3. data      remove what the account's own cascade does not reach: embeddings, queued jobs, file records, and,
 *                if the member chose, the text of messages they sent
 *   4. account   delete the sign-in account; the database cascade removes the profile and everything the member owns
 *   5. complete  close the ledger entry and the member's privacy request, and write the audit entry
 *   6. tidy      refresh cached pages, then tell the member (the address is used once and not kept)
 *
 * Kept on purpose, and told to the member: payment records (accounting and tax law), reports about the account with the
 * content they quoted (community safety), messages already delivered to others if the member chose to keep them
 * (they no longer carry the member's name). The audit log keeps only the opaque id. docs/DPDP_RETENTION.md has the detail.
 */
const PAGE = 500;

async function removeStoredObjects(db, userId) {
  if (!getIntegrations().r2) return { ok: true, skipped: true, removed: 0 };
  let removed = 0;
  let after = null;
  for (;;) {
    let q = db.from("files").select("id, bucket, storage_key").eq("owner_id", userId).order("id").limit(PAGE);
    if (after) q = q.gt("id", after);
    const { data: files, error } = await q;
    if (error) return { ok: false, error: error.message };
    if (!files?.length) break;
    for (const f of files) {
      try {
        await deleteObject({ visibility: f.bucket, key: f.storage_key });
        removed += 1;
      } catch (err) {
        if (err?.$metadata?.httpStatusCode !== 404) return { ok: false, error: err?.message ?? "storage" };
      }
    }
    after = files[files.length - 1].id;
    if (files.length < PAGE) break;
  }
  return { ok: true, removed };
}

/**
 * @param {string} userId
 * @param {{ requestId?: string|null, eraseMessages?: boolean }} [ctx] taken from the deletion request when omitted
 */
export async function executeAccountDeletion(userId, ctx = {}) {
  const db = createAdminClient();
  const steps = {};
  const failStep = async (step, message) => {
    console.error(`[deletion] ${step} failed:`, message);
    await db.rpc("record_erasure_failure", { p_user: userId, p_step: step, p_error: String(message).slice(0, 200) });
    return fail("The account could not be erased yet. It will be retried.", { code: step });
  };

  let { requestId = null } = ctx;
  if (requestId === null) {
    const { data: row } = await db.from("account_deletion_requests").select("privacy_request_id").eq("user_id", userId).eq("status", "processing").maybeSingle();
    requestId = row?.privacy_request_id ?? null;
  }

  const [{ data: authUser }, { data: profile }] = await Promise.all([
    db.auth.admin.getUserById(userId),
    db.from("profiles").select("username, full_name, college_id").eq("id", userId).maybeSingle(),
  ]);
  const email = authUser?.user?.email ?? null;

  const begun = await db.rpc("begin_account_erasure", { p_user: userId, p_request: requestId });
  if (begun.error) return failStep("begin", begun.error.message);
  const retained = begun.data?.retained ?? [];
  const eraseMessages = ctx.eraseMessages ?? begun.data?.erase_messages ?? false;

  const stored = await removeStoredObjects(db, userId);
  if (!stored.ok) return failStep("storage", stored.error);
  steps.storage = stored.skipped ? "skipped: file storage is not configured" : `${stored.removed} objects removed`;

  // Academy: order records lose the buyer's name and issued certificates withdraw theirs; learning data goes with the account.
  const academy = await db.rpc("academy_erase_user", { p_user: userId });
  if (academy.error && !/does not exist|schema cache/i.test(academy.error.message)) return failStep("academy", academy.error.message);
  steps.academy = academy.data ?? "not applicable";

  const data = await db.rpc("erase_user_data", { p_user: userId, p_erase_messages: eraseMessages });
  if (data.error) return failStep("data", data.error.message);
  steps.data = data.data;

  const { error: authError } = await db.auth.admin.deleteUser(userId);
  if (authError && !/not.?found/i.test(authError.message ?? "")) return failStep("account", authError.message);
  steps.account = "deleted";

  const done = await db.rpc("complete_account_erasure", { p_user: userId, p_request: requestId, p_retained: retained, p_steps: steps });
  if (done.error) {
    // The account is gone. The paperwork is finished by reconcile_erasure_requests() in the next retention run.
    console.error("[deletion] could not close the ledger entry; it will be reconciled:", done.error.message);
  }

  try {
    if (profile?.username) revalidatePath(`/u/${profile.username}`);
    revalidatePath("/feed");
  } catch {
    /* outside a request scope (a script): nothing cached by Next to refresh */
  }

  if (email) {
    const { data: ref } = requestId ? await db.from("privacy_requests").select("reference").eq("id", requestId).maybeSingle() : { data: null };
    const mail = accountErasedEmail({ name: profile?.full_name?.split(" ")[0], retained, reference: ref?.reference });
    sendEmail({ to: email, ...mail }).catch(() => {});
  }
  return ok({ retained });
}

/** Worker step: erase accounts whose grace period ended (or that staff approved). */
export async function processDueDeletions({ limit = 10 } = {}) {
  const db = createAdminClient();
  const { data, error } = await db.rpc("claim_due_deletions", { p_limit: limit });
  if (error) return { error: error.message };
  let deleted = 0;
  for (const row of data ?? []) {
    const res = await executeAccountDeletion(row.user_id, { requestId: row.privacy_request_id, eraseMessages: row.erase_messages });
    if (res.ok) deleted += 1;
  }
  return { claimed: data?.length ?? 0, deleted };
}
