// Shrinks a photo before it is sent in a chat. Runs in a Web Worker (components never block on it) with a main-thread
// fallback for browsers without OffscreenCanvas. Pure of React and of the DOM: it takes a Blob, returns a Blob.
//
// Rules, in the order they are applied:
//   - Only JPEG, PNG and WebP are touched. A PDF or anything else passes through.
//   - Small, already modest images are left alone: re-encoding a lossy file for a few KB only loses quality.
//   - Long edge is limited to 2048 px, which is more than any phone chat bubble shows and about 4x the pixels a
//     full-screen preview needs.
//   - JPEG stays JPEG and WebP stays WebP at quality 0.82. PNG stays PNG (it may have transparency or be a
//     screenshot) and is only shrunk by resizing.
//   - If the result is not at least 10% smaller, the ORIGINAL is returned untouched.
//   - Re-encoding through a canvas drops EXIF, so GPS location and camera model do not leave the device.

export const COMPRESS = { maxEdge: 2048, quality: 0.82, keepBelowBytes: 350 * 1024, minSaving: 0.9, maxPixels: 40_000_000 };
const SUPPORTED = ["image/jpeg", "image/png", "image/webp"];

export function wantsCompression(file) {
  return Boolean(file) && SUPPORTED.includes(file.type);
}

/** Target size for a source image: scaled down so the long edge is at most maxEdge, never up. */
export function targetSize(width, height, maxEdge = COMPRESS.maxEdge) {
  const long = Math.max(width, height);
  if (long <= maxEdge) return { width, height, scaled: false };
  const k = maxEdge / long;
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)), scaled: true };
}

/**
 * @param {Blob} blob
 * @param {{ createCanvas: (w:number,h:number)=>any, encode: (canvas:any, type:string, quality?:number)=>Promise<Blob|null>, decode?: (blob:Blob)=>Promise<any> }} env
 * @returns {Promise<{ blob: Blob, changed: boolean, width?: number, height?: number }>}
 */
export async function compressImage(blob, env) {
  if (!SUPPORTED.includes(blob.type)) return { blob, changed: false };
  const decode = env.decode ?? ((b) => createImageBitmap(b, { imageOrientation: "from-image" }));
  let bitmap;
  try {
    bitmap = await decode(blob);
  } catch {
    return { blob, changed: false }; // cannot decode here: send as it is, the server validates it anyway
  }
  try {
    const { width, height, scaled } = targetSize(bitmap.width, bitmap.height);
    if (bitmap.width * bitmap.height > COMPRESS.maxPixels) return { blob, changed: false };
    if (!scaled && blob.size <= COMPRESS.keepBelowBytes) return { blob, changed: false, width, height };
    if (!scaled && blob.type === "image/png" && blob.size <= 1.5 * 1024 * 1024) return { blob, changed: false, width, height };

    const canvas = env.createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (blob.type === "image/jpeg") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
    }
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, width, height);
    const out = await env.encode(canvas, blob.type, blob.type === "image/png" ? undefined : COMPRESS.quality);
    if (!out || out.type !== blob.type || out.size >= blob.size * COMPRESS.minSaving) return { blob, changed: false, width, height };
    return { blob: out, changed: true, width, height };
  } finally {
    bitmap.close?.();
  }
}
