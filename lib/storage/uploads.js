import "server-only";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getIntegrations } from "@/lib/env";
import { getSetting } from "@/lib/settings";
import { enforceRateLimit } from "@/lib/rate-limit";
import { fail, ok } from "@/lib/actions/result";
import { UPLOAD_PURPOSES, MIME_EXTENSION, detectMime, sanitizeFilename } from "@/lib/storage/policy";
import { CACHE_CONTROL, PRIVATE_SIGNING, cacheControlForPurpose } from "@/lib/storage/cache";
import { putObject, deleteObject, presignDownload } from "@/lib/storage/r2";
import { inspectImage } from "@/lib/storage/inspect-image";
import { scanUpload } from "@/lib/storage/scan";

let warnedMediaConfig = false;

/**
 * Server-relayed upload. The server receives the bytes, decides the real file type from
 * the content itself (client-supplied filename and Content-Type are never trusted),
 * enforces size/type policy, stores the object and records ownership metadata.
 *
 * Relaying (rather than browser-direct presigned PUTs) keeps validation in front of
 * storage and needs no bucket CORS configuration.
 */
export async function uploadFile({ user, purpose, file }) {
  if (!getIntegrations().r2) {
    return fail("File uploads are not available right now (storage is not configured).", { code: "storage_unconfigured" });
  }
  const rule = UPLOAD_PURPOSES[purpose];
  if (!rule) return fail("Unsupported upload type.", { code: "invalid_purpose" });

  const limited = await enforceRateLimit("upload", user.id, { limit: 20, windowSec: 300 });
  if (limited) return limited;

  const maxMb = Number(await getSetting(rule.sizeSetting)) || 5;
  if (!file || typeof file.arrayBuffer !== "function" || !file.size) return fail("The file looks empty.", { code: "invalid_size" });
  if (file.size > maxMb * 1024 * 1024) return fail(`Files must be ${maxMb} MB or smaller.`, { code: "too_large" });

  let bytes = Buffer.from(await file.arrayBuffer());
  const mime = detectMime(bytes);
  if (!mime || !rule.mimes.includes(mime)) {
    return fail("That file type is not allowed here. Use a JPG, PNG or WebP image" + (rule.mimes.includes("application/pdf") ? " or a PDF." : "."), {
      code: "invalid_type",
    });
  }

  // The first bytes only say what the file claims to be. Images must really decode (and lose any location metadata);
  // PDFs, which can carry active content, go through the scanning service when one is configured.
  let size = null;
  if (mime.startsWith("image/")) {
    const checked = await inspectImage(bytes, mime);
    if (!checked.ok) return fail("That image could not be read. Try saving it again as a JPG, PNG or WebP.", { code: "invalid_type" });
    bytes = checked.bytes;
    size = { width: checked.width, height: checked.height };
    if (bytes.length > maxMb * 1024 * 1024) return fail(`Files must be ${maxMb} MB or smaller.`, { code: "too_large" });
  } else {
    const scan = await scanUpload(bytes);
    if (!scan.clean) return fail("That file could not be checked and was not accepted.", { code: "scan_failed" });
  }

  // Without a configured public bucket, "public" purposes live in the private bucket and are
  // served through the authorised /api/media route.
  if (!warnedMediaConfig && process.env.NEXT_PUBLIC_MEDIA_URL && !getIntegrations().r2Public) {
    warnedMediaConfig = true;
    console.warn("[storage] NEXT_PUBLIC_MEDIA_URL is set but the public bucket is not configured: public images are being stored in the private bucket and the media URL will not find them.");
  }
  const bucket = rule.bucket === "public" && !getIntegrations().r2Public ? "private" : rule.bucket;
  const key = `${purpose}/${user.id}/${randomUUID()}.${MIME_EXTENSION[mime]}`;

  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("files")
    .insert({
      owner_id: user.id,
      bucket,
      storage_key: key,
      purpose,
      mime_type: mime,
      size_bytes: bytes.length,
      // Public images are readable by every member: the name on the uploader's device (often a person's name) stays private.
      original_name: rule.bucket === "public" ? null : sanitizeFilename(file.name),
      width: size?.width ?? null,
      height: size?.height ?? null,
    })
    .select("id")
    .single();
  if (error) return fail("You cannot upload files right now.", { code: "forbidden" });

  const admin = createAdminClient();
  try {
    await putObject({ visibility: bucket, key, body: bytes, contentType: mime, cacheControl: cacheControlForPurpose(purpose, rule) });
  } catch (err) {
    console.error("[storage] upload failed:", err?.name, err?.message);
    await admin.from("files").update({ status: "deleted", deleted_at: new Date().toISOString() }).eq("id", row.id);
    return fail("The upload failed. Please try again.", { code: "storage_error" });
  }

  const { error: readyError } = await admin
    .from("files")
    .update({ status: "ready", ready_at: new Date().toISOString() })
    .eq("id", row.id);
  if (readyError) return fail("Could not finalize the upload.", { code: "db_error" });

  return ok({ fileId: row.id, key, mime, size: bytes.length });
}

/** Owner-initiated delete (soft in DB, object removed from storage). */
export async function deleteOwnedFile({ user, fileId }) {
  const supabase = await createClient();
  const { data: file } = await supabase
    .from("files")
    .select("id, owner_id, bucket, storage_key")
    .eq("id", fileId)
    .maybeSingle();
  if (!file || file.owner_id !== user.id) return fail("File not found.", { code: "not_found" });
  try {
    await deleteObject({ visibility: file.bucket, key: file.storage_key });
  } catch (err) {
    console.error("[storage] delete failed", err?.message);
  }
  await createAdminClient()
    .from("files")
    .update({ status: "deleted", deleted_at: new Date().toISOString() })
    .eq("id", file.id);
  return ok();
}

/** Removes a stored object and marks its file row deleted. For files an administrator replaced or abandoned (the caller has already checked permission). */
export async function discardStoredFile(key) {
  const admin = createAdminClient();
  const { data: file } = await admin.from("files").select("id, bucket, storage_key").eq("storage_key", key).eq("purpose", "orbit_badge").maybeSingle();
  if (!file) return;
  try {
    await deleteObject({ visibility: file.bucket, key: file.storage_key });
  } catch (err) {
    console.error("[storage] delete failed", err?.message);
  }
  await admin.from("files").update({ status: "deleted", deleted_at: new Date().toISOString() }).eq("id", file.id);
}

/**
 * Signed URL for a file the *caller* is allowed to see (RLS decides), with how it may be cached:
 *  - an attachment image: the URL is the same for five minutes and storage tells the browser to keep it for as long, so
 *    a feed or conversation that is reopened does not read storage again; only the member's own browser may keep it;
 *  - anything else (documents, identity documents): a fresh short-lived URL that nothing may keep.
 * Returns null when the file does not exist or the caller may not see it.
 */
export async function getReadableFile(fileId, { expiresIn = 120, download = false } = {}) {
  const supabase = await createClient();
  const { data: file } = await supabase
    .from("files")
    .select("id, bucket, storage_key, mime_type, original_name, status, purpose")
    .eq("id", fileId)
    .maybeSingle();
  if (!file || file.status !== "ready") return null;
  // A download is for saving, not for showing again: it is never kept, and it always has a usable name.
  const keepable = !download && file.purpose !== "verification_document" && String(file.mime_type ?? "").startsWith("image/");
  const fallbackName = `unisphere-${String(file.id).slice(0, 8)}.${MIME_EXTENSION[file.mime_type] ?? "bin"}`;
  const url = await presignDownload({
    visibility: file.bucket,
    key: file.storage_key,
    expiresIn,
    filename: download ? file.original_name || fallbackName : file.original_name,
    disposition: download ? "attachment" : "inline",
    contentType: file.mime_type,
    cacheControl: keepable ? CACHE_CONTROL.privateImage : CACHE_CONTROL.privateNoStore,
    signing: keepable ? PRIVATE_SIGNING : undefined,
  });
  return { url, keepable };
}

/** Signed URL only (for callers that do not care how it is cached). */
export async function getReadableFileUrl(fileId, options) {
  return (await getReadableFile(fileId, options))?.url ?? null;
}
