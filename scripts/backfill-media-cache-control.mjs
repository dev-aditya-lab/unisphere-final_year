// One-off: give public images uploaded BEFORE cache headers were added the same `Cache-Control` new uploads get
// ("public, max-age=31536000, immutable"), so browsers and Cloudflare can keep them for as long as they are valid.
//
// What it touches: only objects in the PUBLIC bucket that the `files` table lists as ready, for the public purposes
// (avatar, cover, project_asset, community_image, event_banner, orbit_badge). Private files are never read or changed.
// It does not list the bucket: the database is the list.
//
// How: HEAD each object (skips those that already have a Cache-Control), then copies it onto itself with replaced metadata
// (same bytes, same Content-Type, new Cache-Control). The bytes and the key do not change, so every stored URL still works.
//
// It changes objects in your Cloudflare account, so it is only run on request and does nothing unless --apply is given:
//   node scripts/backfill-media-cache-control.mjs            # dry run: counts what would change
//   node scripts/backfill-media-cache-control.mjs --apply    # does it
// Safe to run again (objects that already have the header are skipped). Set the same CLOUDFLARE_* and Supabase variables as
// the app (see .env.example); the service-role key is read from SUPABASE_SECRET_KEY.
import { config } from "dotenv";
import { S3Client, HeadObjectCommand, CopyObjectCommand } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.development.local", quiet: true });
config({ path: ".env.local", quiet: true });
config({ quiet: true });

const env = process.env;
const apply = process.argv.includes("--apply");
const CACHE_CONTROL = "public, max-age=31536000, immutable";
const PUBLIC_PURPOSES = ["avatar", "cover", "project_asset", "community_image", "event_banner", "orbit_badge"];
const PAGE = 200;

const endpoint = env.CLOUDFLARE_R2_ENDPOINT || (env.CLOUDFLARE_ACCOUNT_ID ? `https://${env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com` : null);
const bucket = env.CLOUDFLARE_R2_PUBLIC_BUCKET_NAME;
const secret = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
if (!endpoint || !env.CLOUDFLARE_R2_ACCESS_KEY_ID || !env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || !bucket || !env.NEXT_PUBLIC_SUPABASE_URL || !secret) {
  console.error("Needs CLOUDFLARE_* (including CLOUDFLARE_R2_PUBLIC_BUCKET_NAME) and Supabase variables. See .env.example.");
  process.exit(1);
}

const s3 = new S3Client({
  region: env.CLOUDFLARE_R2_REGION || "auto",
  endpoint,
  forcePathStyle: env.CLOUDFLARE_R2_FORCE_PATH_STYLE === "true",
  credentials: { accessKeyId: env.CLOUDFLARE_R2_ACCESS_KEY_ID, secretAccessKey: env.CLOUDFLARE_R2_SECRET_ACCESS_KEY },
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, secret, { auth: { persistSession: false } });

const stats = { seen: 0, alreadySet: 0, wouldUpdate: 0, updated: 0, missing: 0, failed: 0 };

async function handle(file) {
  stats.seen += 1;
  const Key = file.storage_key;
  let head;
  try {
    head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key }));
  } catch (err) {
    if (err?.$metadata?.httpStatusCode === 404 || err?.name === "NotFound") {
      stats.missing += 1; // the row says ready but the object is gone: reported, not "fixed" here
      return;
    }
    stats.failed += 1;
    console.warn(`! ${Key}: ${err?.name || err?.message}`);
    return;
  }
  if (head.CacheControl) {
    stats.alreadySet += 1;
    return;
  }
  if (!apply) {
    stats.wouldUpdate += 1;
    return;
  }
  try {
    await s3.send(
      new CopyObjectCommand({
        Bucket: bucket,
        Key,
        CopySource: `${bucket}/${Key.split("/").map(encodeURIComponent).join("/")}`,
        MetadataDirective: "REPLACE",
        ContentType: head.ContentType || file.mime_type,
        CacheControl: CACHE_CONTROL,
        Metadata: head.Metadata,
      }),
    );
    stats.updated += 1;
  } catch (err) {
    stats.failed += 1;
    console.warn(`! ${Key}: ${err?.name || err?.message}`);
  }
}

let from = 0;
for (;;) {
  const { data, error } = await db
    .from("files")
    .select("storage_key, mime_type")
    .eq("status", "ready")
    .eq("bucket", "public")
    .in("purpose", PUBLIC_PURPOSES)
    .order("created_at")
    .range(from, from + PAGE - 1);
  if (error) {
    console.error("Could not read the files table:", error.message);
    process.exit(1);
  }
  if (!data?.length) break;
  for (const file of data) await handle(file);
  if (data.length < PAGE) break;
  from += PAGE;
}

console.log(apply ? "Done." : "Dry run (nothing changed). Run again with --apply to update.", stats);
