// Isomorphic helpers for media URLs (safe in client components).
// NEXT_PUBLIC_MEDIA_URL (optional) is the public base URL of the *public* R2 bucket (r2.dev URL or custom domain).

const MEDIA_BASE = (process.env.NEXT_PUBLIC_MEDIA_URL || "").replace(/\/$/, "");

/**
 * URL for an intentionally-public image (avatar, cover, banner).
 * Uses the public bucket / CDN when NEXT_PUBLIC_MEDIA_URL is set, otherwise the
 * app's own /api/media proxy, which redirects to a short-lived signed URL.
 */
export function mediaUrl(key) {
  if (!key) return null;
  return MEDIA_BASE ? `${MEDIA_BASE}/${key}` : `/api/media/${key}`;
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
