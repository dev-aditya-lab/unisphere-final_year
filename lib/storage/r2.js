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

export async function presignDownload({ visibility = "private", key, expiresIn = 120, filename, contentType }) {
  const cmd = new GetObjectCommand({
    Bucket: bucketName(visibility),
    Key: key,
    ResponseContentDisposition: filename ? `inline; filename="${filename.replace(/[^\w.\- ]/g, "_")}"` : undefined,
    ResponseContentType: contentType,
  });
  return getSignedUrl(getClient(), cmd, { expiresIn });
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

export async function putObject({ visibility, key, body, contentType }) {
  await getClient().send(
    new PutObjectCommand({ Bucket: bucketName(visibility), Key: key, Body: body, ContentType: contentType }),
  );
}

export async function deleteObject({ visibility, key }) {
  await getClient().send(new DeleteObjectCommand({ Bucket: bucketName(visibility), Key: key }));
}

export function publicObjectUrl(key) {
  const base = getEnv().CLOUDFLARE_R2_PUBLIC_URL;
  return base ? `${base.replace(/\/$/, "")}/${key}` : null;
}
