import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getIntegrations } from "@/lib/env";
import { deleteObject } from "@/lib/storage/r2";

/**
 * Removes the stored objects of files that belonged to something that was just permanently deleted (the database function
 * returns them as [{ id, bucket, storage_key }]). Best effort and never throws: the content is already gone, and a file that
 * could not be removed now is an unreferenced file the maintenance worker's orphan sweep removes on a later tick.
 */
export async function removeStoredFiles(files) {
  if (!Array.isArray(files) || files.length === 0 || !getIntegrations().r2) return { removed: 0 };
  const db = createAdminClient();
  let removed = 0;
  for (const f of files) {
    try {
      await deleteObject({ visibility: f.bucket, key: f.storage_key });
    } catch (err) {
      if (err?.$metadata?.httpStatusCode !== 404) {
        console.error("[purge] could not remove a stored file; the orphan sweep will retry:", err?.message);
        continue;
      }
    }
    await db.from("files").update({ status: "deleted", deleted_at: new Date().toISOString() }).eq("id", f.id);
    removed += 1;
  }
  return { removed };
}
