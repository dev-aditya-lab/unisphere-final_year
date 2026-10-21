// Isomorphic helpers for media URLs (safe in client components).
// NEXT_PUBLIC_MEDIA_URL (optional) is the public base URL of the *public* R2 bucket (r2.dev URL or custom domain).
// NEXT_PUBLIC_MEDIA_RESIZE=cloudflare (optional, off by default) asks Cloudflare to serve smaller copies of public images
// (Cloudflare "Image Transformations" must be switched on for the media domain; see docs/MEDIA_CACHING.md).
// NEXT_PUBLIC_* values must be read as literal `process.env.NEXT_PUBLIC_X` so the bundler can inline them.

const MEDIA_BASE = (process.env.NEXT_PUBLIC_MEDIA_URL || "").replace(/\/$/, "");
const RESIZE = process.env.NEXT_PUBLIC_MEDIA_RESIZE === "cloudflare" && Boolean(MEDIA_BASE);

// Requested widths are rounded up to one of these, so one picture exists in a handful of sizes (each size is cached
// separately and, at Cloudflare, counted once) however many places ask for slightly different ones.
export const MEDIA_WIDTHS = [48, 96, 160, 320, 640, 1280];
const snapWidth = (w) => MEDIA_WIDTHS.find((step) => step >= w) ?? null;

/** A stored key must be a plain relative path: nothing that could change the host, add a query or climb out of the folder. */
export function isSafeMediaKey(key) {
  return typeof key === "string" && key.length > 0 && key.length <= 300 && !/^\/|\.\.|[?#\\:]|\/\/|\s/.test(key);
}

/**
 * URL for an intentionally-public image (avatar, cover, banner). Pure string work: it never calls storage, signs anything
 * or checks that the object exists, so rendering a list of avatars costs no storage operations.
 *
 * Uses the public bucket / CDN when NEXT_PUBLIC_MEDIA_URL is set, otherwise the app's own /api/media route, which
 * redirects to a short-lived signed URL. Keys are never reused for different bytes, so the URL of a picture is stable.
 *
 * `width` is the CSS width the picture is shown at, doubled by the caller for sharp screens. It only changes the URL when
 * resizing is switched on; the stored original is otherwise served as it always was. Pass it only for pictures shown small
 * (avatars, cards): a badge or a full-size view wants the original, and a transparent picture stays transparent either way.
 * Returns null for an empty or unsafe key, so the caller shows its fallback.
 */
export function mediaUrl(key, { width } = {}) {
  if (!key || !isSafeMediaKey(key)) return null;
  if (!MEDIA_BASE) return `/api/media/${key}`;
  const w = RESIZE && width ? snapWidth(width) : null;
  return w ? `${MEDIA_BASE}/cdn-cgi/image/width=${w},fit=scale-down,quality=82,format=auto/${key}` : `${MEDIA_BASE}/${key}`;
}

/** URL for a private file; the route authorises the caller and redirects to a signed URL. */
export function privateFileUrl(fileId) {
  return fileId ? `/api/files/${fileId}` : null;
}

export function initials(name) {
  const parts = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}
