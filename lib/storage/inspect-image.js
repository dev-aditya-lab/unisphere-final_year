import "server-only";
import sharp from "sharp";

/**
 * Looks inside an uploaded image instead of trusting its first bytes. The magic number only says what a file claims to
 * be; here the image library has to actually decode it, which rejects truncated files, files that start like an image
 * and carry something else after it, and decompression bombs (a small file that expands to billions of pixels).
 *
 * A single-frame image that carries metadata (EXIF: camera, GPS position; XMP; IPTC) is re-encoded without it, so a
 * location never reaches storage even when the upload did not come from our own editor (which already strips it).
 */

/** Largest image accepted, in pixels (about 7000 x 7000). The library's own default is five times higher. */
export const MAX_PIXELS = 50_000_000;

const FORMAT = { "image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp" };
const open = (bytes) => sharp(bytes, { limitInputPixels: MAX_PIXELS, failOn: "error" });

/**
 * @returns {Promise<{ ok: true, bytes: Buffer, width: number, height: number, stripped: boolean } | { ok: false, reason: string }>}
 */
export async function inspectImage(bytes, mime) {
  const expected = FORMAT[mime];
  if (!expected) return { ok: false, reason: "unsupported" };
  try {
    const meta = await open(bytes).metadata();
    if (meta.format !== expected) return { ok: false, reason: "format_mismatch" };
    if (!meta.width || !meta.height) return { ok: false, reason: "no_size" };

    // Decode every pixel (shrunk while decoding, so this is cheap) to prove the whole file is a real image.
    await open(bytes).resize(16, 16, { fit: "inside" }).raw().toBuffer();

    const swap = meta.orientation && meta.orientation >= 5;
    let width = swap ? meta.height : meta.width;
    let height = swap ? meta.width : meta.height;

    const hasMetadata = Boolean(meta.exif || meta.xmp || meta.iptc);
    if (!hasMetadata || (meta.pages ?? 1) > 1) return { ok: true, bytes, width, height, stripped: false };

    // `rotate()` applies the orientation flag to the pixels before the flag is dropped; nothing else is carried over.
    let image = open(bytes).rotate();
    if (expected === "jpeg") image = image.jpeg({ quality: 90 });
    else if (expected === "webp") image = image.webp({ quality: 90 });
    else image = image.png();
    const clean = await image.toBuffer({ resolveWithObject: true });
    width = clean.info.width;
    height = clean.info.height;
    return { ok: true, bytes: clean.data, width, height, stripped: true };
  } catch {
    return { ok: false, reason: "unreadable" };
  }
}
