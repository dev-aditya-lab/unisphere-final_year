// Cache policy for stored files, in one place (isomorphic: no secrets, no I/O).
//
// Why these values:
//  - Public images live at keys like avatar/<user>/<uuid>.webp. A replacement always gets a NEW uuid and the old object is
//    deleted, so the bytes at a key never change: they can be cached for a year and marked immutable.
//  - Private files (post and chat attachments, verification documents) are reached through /api/files, which checks who
//    is asking. They are never cached by a shared cache. Images may sit in the member's own browser for a few minutes so a
//    feed that is scrolled or reopened does not read storage again; identity documents are never kept.

export const CACHE_CONTROL = {
  /** Public image at a key that is never rewritten. */
  publicImmutable: "public, max-age=31536000, immutable",
  /** A private image: the member's own browser may reuse it briefly. Never a shared cache. */
  privateImage: "private, max-age=300",
  /** Identity documents and anything not an image: not kept at all. */
  privateNoStore: "private, no-store",
};

/** Which Cache-Control a newly stored object should carry, by what it is for. */
export function cacheControlForPurpose(purpose, rule) {
  if (rule?.bucket === "public") return CACHE_CONTROL.publicImmutable;
  if (purpose === "verification_document") return CACHE_CONTROL.privateNoStore;
  return CACHE_CONTROL.privateImage;
}

/**
 * Signed storage URLs normally differ on every request (the signature includes the second it was made), so the browser
 * can never recognise a picture it already has. Signing as of the start of a time window gives every request in that
 * window the same URL, so the browser's own cache (keyed by URL) answers repeats and storage is read once.
 *
 * The URL stays valid for at least `minValiditySec` from any moment inside its window.
 */
export function stableSigning({ now = Date.now(), windowSec, minValiditySec }) {
  const startSec = Math.floor(now / 1000 / windowSec) * windowSec;
  return { signingDate: new Date(startSec * 1000), expiresIn: windowSec + minValiditySec };
}

/** Private image windows: five minutes, matching how long the browser may keep the picture. */
export const PRIVATE_SIGNING = { windowSec: 300, minValiditySec: 300 };
/** Public image windows (used only when no public bucket exists and /api/media redirects): a day, since the image is public. */
export const PUBLIC_SIGNING = { windowSec: 86_400, minValiditySec: 21_600 };
