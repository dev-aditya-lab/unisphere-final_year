import "server-only";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getEnv, getIntegrations } from "@/lib/env";
import { stableSigning } from "@/lib/storage/cache";

/**
 * Cloudflare R2 through the S3-compatible API.
 *  - "private" bucket: only reachable with short-lived signed URLs.
 *  - "public"  bucket: avatars, covers and other intentionally public images.
 * Locally the same code talks to the RustFS container from docker-compose.dev.yml.
 */

let client;

export class StorageNotConfiguredError extends Error {
  constructor() {
    super("File storage is not configured (Cloudflare R2 credentials are missing).");
    this.name = "StorageNotConfiguredError";
  }
}

function getClient() {
  if (!getIntegrations().r2) throw new StorageNotConfiguredError();
  if (!client) {
    const env = getEnv();
    client = new S3Client({
      region: env.CLOUDFLARE_R2_REGION,
      endpoint: env.CLOUDFLARE_R2_ENDPOINT || `https://${env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      forcePathStyle: env.CLOUDFLARE_R2_FORCE_PATH_STYLE,
      credentials: {
        accessKeyId: env.CLOUDFLARE_R2_ACCESS_KEY_ID,
        secretAccessKey: env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
      },
      // R2 does not implement the newer default checksum behaviour.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  }
  return client;
}

export function bucketName(visibility) {
  const env = getEnv();
  if (visibility === "public") {
    if (!env.CLOUDFLARE_R2_PUBLIC_BUCKET_NAME) throw new StorageNotConfiguredError();
    return env.CLOUDFLARE_R2_PUBLIC_BUCKET_NAME;
  }
  return env.CLOUDFLARE_R2_BUCKET_NAME;
}

/** Short-lived URL the browser can PUT the file to. Type and length are part of the signature. */
export async function presignUpload({ visibility, key, contentType, contentLength, expiresIn = 300 }) {
  const cmd = new PutObjectCommand({
    Bucket: bucketName(visibility),
    Key: key,
    ContentType: contentType,
    ContentLength: contentLength,
  });
  return getSignedUrl(getClient(), cmd, { expiresIn, unhoistableHeaders: new Set(["content-type", "content-length"]) });
}

/**
 * The Content-Disposition storage should answer with. `attachment` makes a browser save the file instead of showing it (the
 * "Download" action); `inline` shows it (images, PDFs). The name is reduced to a safe subset: no quotes, slashes, control
 * characters or header-splitting bytes can reach the header.
 */
export function contentDisposition(disposition, filename) {
  const type = disposition === "attachment" ? "attachment" : "inline";
  if (!filename && type === "inline") return undefined;
  const safe = String(filename || "download").replace(/[^\w.\- ]/g, "_").replace(/\.{2,}/g, ".").slice(0, 120) || "download";
  return `${type}; filename="${safe}"`;
}

/**
 * Short-lived URL to read an object. `expiresIn` is how long the URL is guaranteed to work (seconds).
 * With `signing` ({ windowSec, minValiditySec }) the URL is the same for everyone asking in the same time window, so
 * the browser can reuse a picture it already has; without it every call returns a fresh URL (for files that must not
 * be kept). `cacheControl` is sent by storage with the file itself.
 */
export async function presignDownload({ visibility = "private", key, expiresIn = 120, filename, contentType, cacheControl, signing, disposition = "inline" }) {
  const cmd = new GetObjectCommand({
    Bucket: bucketName(visibility),
    Key: key,
    ResponseContentDisposition: contentDisposition(disposition, filename),
    ResponseContentType: contentType,
    ResponseCacheControl: cacheControl,
  });
  return getSignedUrl(getClient(), cmd, signing ? stableSigning(signing) : { expiresIn });
}

export async function headObject({ visibility, key }) {
  try {
    const out = await getClient().send(new HeadObjectCommand({ Bucket: bucketName(visibility), Key: key }));
    return { exists: true, size: Number(out.ContentLength ?? 0), contentType: out.ContentType };
  } catch (err) {
    if (err?.$metadata?.httpStatusCode === 404 || err?.name === "NotFound") return { exists: false };
    throw err;
  }
}

/** Read the first `bytes` of an object (used for magic-number sniffing). */
export async function readHead({ visibility, key, bytes = 16 }) {
  const out = await getClient().send(
    new GetObjectCommand({ Bucket: bucketName(visibility), Key: key, Range: `bytes=0-${bytes - 1}` }),
  );
  const chunks = [];
  for await (const chunk of out.Body) chunks.push(chunk);
  return Buffer.concat(chunks);
}

/** A whole (small) object as a Buffer: certificate templates and the certificates made from them. Refuses anything over `maxBytes`. */
export async function getObjectBytes({ visibility, key, maxBytes = 16 * 1024 * 1024 }) {
  const out = await getClient().send(new GetObjectCommand({ Bucket: bucketName(visibility), Key: key }));
  const chunks = [];
  let total = 0;
  for await (const chunk of out.Body) {
    total += chunk.length;
    if (total > maxBytes) throw new Error("object_too_large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/** `cacheControl` is stored with the object and returned on every read (see lib/storage/cache.js). */
export async function putObject({ visibility, key, body, contentType, cacheControl }) {
  await getClient().send(
    new PutObjectCommand({ Bucket: bucketName(visibility), Key: key, Body: body, ContentType: contentType, CacheControl: cacheControl }),
  );
}

export async function deleteObject({ visibility, key }) {
  await getClient().send(new DeleteObjectCommand({ Bucket: bucketName(visibility), Key: key }));
}

export function publicObjectUrl(key) {
  const base = getEnv().CLOUDFLARE_R2_PUBLIC_URL;
  return base ? `${base.replace(/\/$/, "")}/${key}` : null;
}
