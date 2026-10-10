import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getIntegrations } from "@/lib/env";
import { deleteObject } from "@/lib/storage/r2";
import { fail, ok } from "@/lib/actions/result";

/**
 * Permanent account erasure. Runs only after the 14-day grace period (worker) or an administrator's
 * approval (admin console). Stored files are removed first; deleting the auth user then cascades to the
 * profile and everything the member owns (posts, comments, projects, connections, notifications…).
 * Messages they sent stay in the other person's conversation with the sender shown as removed, and reports
 * about them keep their snapshots with the account link cleared — both are deliberate (safety records).
 * The audit log keeps only the opaque id.
 */
export async function executeAccountDeletion(userId) {
  const db = createAdminClient();
  const { data: profile } = await db.from("profiles").select("college_id").eq("id", userId).maybeSingle();

  if (getIntegrations().r2) {
    const { data: files } = await db.from("files").select("bucket, storage_key").eq("owner_id", userId).neq("status", "deleted");
    for (const f of files ?? []) {
      try {
        await deleteObject({ visibility: f.bucket, key: f.storage_key });
      } catch (err) {
        if (err?.$metadata?.httpStatusCode !== 404) {
          console.error("[deletion] could not remove a stored file; will retry later:", err?.message);
          return fail("Stored files could not be removed yet. It will be retried.", { code: "storage" });
        }
      }
    }
  }

  const { error } = await db.auth.admin.deleteUser(userId);
  if (error) {
    console.error("[deletion] auth delete failed:", error.message);
    return fail("The account could not be deleted yet. It will be retried.", { code: "auth" });
  }
  await db.rpc("write_audit_log", {
    p_actor: null, p_action: "account.deleted", p_target_type: "user", p_target_id: userId,
    p_college: profile?.college_id ?? null, p_metadata: {},
  });
  return ok();
}

/** Worker step: erase accounts whose grace period ended (or that staff approved). */
export async function processDueDeletions({ limit = 10 } = {}) {
  const db = createAdminClient();
  const { data, error } = await db.rpc("claim_due_deletions", { p_limit: limit });
  if (error) return { error: error.message };
  let deleted = 0;
  for (const row of data ?? []) {
    const res = await executeAccountDeletion(row.user_id);
    if (res.ok) deleted += 1;
  }
  return { claimed: data?.length ?? 0, deleted };
}
