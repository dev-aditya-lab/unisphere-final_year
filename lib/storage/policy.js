/**
 * Upload policy: which file types and sizes are allowed for each purpose.
 * Client-supplied filenames and content types are never trusted; the declared MIME
 * type must be on the allowlist AND match the file's magic bytes after upload.
 */

/**
 * Largest request body /api/upload will read: the biggest file an administrator can allow plus multipart overhead. Next.js
 * buffers a request body for the proxy up to `experimental.proxyClientMaxBodySize` (next.config.mjs, kept equal to this), so
 * anything larger is refused from its headers instead of being read.
 */
export const MAX_UPLOAD_BODY_BYTES = 12 * 1024 * 1024;

export const IMAGE_MIME = ["image/jpeg", "image/png", "image/webp"];
export const DOC_MIME = ["application/pdf"];

export const MIME_EXTENSION = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

/** purpose -> { bucket, mimes, sizeSetting, permission? } (a `permission` means only staff holding it may upload for that purpose) */
export const UPLOAD_PURPOSES = {
  avatar: { bucket: "public", mimes: IMAGE_MIME, sizeSetting: "upload_max_image_mb" },
  cover: { bucket: "public", mimes: IMAGE_MIME, sizeSetting: "upload_max_image_mb" },
  project_asset: { bucket: "public", mimes: IMAGE_MIME, sizeSetting: "upload_max_image_mb" },
  community_image: { bucket: "public", mimes: IMAGE_MIME, sizeSetting: "upload_max_image_mb" },
  event_banner: { bucket: "public", mimes: IMAGE_MIME, sizeSetting: "upload_max_image_mb" },
  orbit_badge: { bucket: "public", mimes: IMAGE_MIME, sizeSetting: "upload_max_image_mb", permission: "orbits.manage" },
  post_attachment: { bucket: "private", mimes: IMAGE_MIME, sizeSetting: "upload_max_attachment_mb" },
  message_attachment: { bucket: "private", mimes: [...IMAGE_MIME, ...DOC_MIME], sizeSetting: "upload_max_attachment_mb" },
  verification_document: { bucket: "private", mimes: [...IMAGE_MIME, ...DOC_MIME], sizeSetting: "upload_max_attachment_mb" },
};

export function isImageMime(mime) {
  return IMAGE_MIME.includes(mime);
}

/** Real MIME type from the file's leading bytes (never from the client's claim). */
export function detectMime(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  if (buf.subarray(0, 5).toString("ascii") === "%PDF-") return "application/pdf";
  return null;
}

/** Strip path components and unsafe characters; used only for display / download names. */
export function sanitizeFilename(name) {
  const base = String(name ?? "file").split(/[\\/]/).pop() || "file";
  return base.replace(/[^\w.\- ]+/g, "_").replace(/\.{2,}/g, ".").slice(0, 120);
}
