"use client";

// Browser-side image processing for the editor: decode, preview and export. The maths lives in ./geometry.js.
// Re-encoding through a canvas also drops EXIF metadata (camera model, GPS location) from what gets uploaded.

import { applyAdjustments, cropToPixels, outputSize, rotatedSize } from "@/lib/images/geometry";

/** Browsers refuse canvases much larger than this (iOS Safari: about 16.7 megapixels). */
const MAX_PIXELS = 16_000_000;

export const EDITABLE_MIME = ["image/jpeg", "image/png", "image/webp"];
const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export function isEditableImage(file) {
  return Boolean(file) && EDITABLE_MIME.includes(file.type);
}

let webpSupport;
/** Whether this browser can encode WebP (Safari historically could not; it silently returns PNG). */
export function canEncodeWebp() {
  if (webpSupport === undefined) {
    try {
      const c = document.createElement("canvas");
      c.width = c.height = 1;
      webpSupport = c.toDataURL("image/webp").startsWith("data:image/webp");
    } catch {
      webpSupport = false;
    }
  }
  return webpSupport;
}

/** Decode a File into an HTMLImageElement. EXIF orientation is applied by the browser when drawing. */
export function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("decode"));
    };
    img.src = url;
  });
}

/** Draws the whole transformed image (no crop) into `canvas`, fitted to maxW x maxH. Returns the display size. */
export function drawPreview(canvas, img, { turns, flipH, flipV }, maxW, maxH) {
  const nat = { w: img.naturalWidth, h: img.naturalHeight };
  const T = rotatedSize(nat.w, nat.h, turns);
  const fit = Math.min(maxW / T.w, maxH / T.h, 2);
  const cssW = Math.max(1, Math.round(T.w * fit));
  const cssH = Math.max(1, Math.round(T.h * fit));
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.save();
  ctx.scale(canvas.width / T.w, canvas.height / T.h);
  paintTransformed(ctx, img, nat, T, turns, flipH, flipV);
  ctx.restore();
  return { w: cssW, h: cssH };
}

// Rotation first, then the mirror in display space, so "flip horizontal" always mirrors what you see.
function paintTransformed(ctx, img, nat, T, turns, flipH, flipV) {
  ctx.translate(T.w / 2, T.h / 2);
  ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
  ctx.rotate((turns * Math.PI) / 2);
  ctx.drawImage(img, -nat.w / 2, -nat.h / 2);
}

function toBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/** The pixel size the export will have for this state (used to disable pointless size presets). */
export function exportSize(img, state) {
  const T = rotatedSize(img.naturalWidth, img.naturalHeight, state.turns);
  const px = cropToPixels(state.crop, T.w, T.h);
  let out = outputSize(px.w, px.h, state.edge);
  if (out.w * out.h > MAX_PIXELS) {
    const k = Math.sqrt(MAX_PIXELS / (out.w * out.h));
    out = outputSize(px.w, px.h, Math.floor(Math.max(out.w, out.h) * k));
  }
  return { crop: px, out, source: T };
}

/**
 * Renders the edited image. Returns { blob, width, height }. JPEG gets a white background (it has no alpha); a
 * format the browser cannot encode falls back to JPEG.
 */
export async function exportImage(img, state) {
  const { crop, out, source } = exportSize(img, state);
  const nat = { w: img.naturalWidth, h: img.naturalHeight };

  async function render(type) {
    const canvas = document.createElement("canvas");
    canvas.width = out.w;
    canvas.height = out.h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (type === "image/jpeg") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, out.w, out.h);
    }
    ctx.imageSmoothingQuality = "high";
    ctx.save();
    ctx.scale(out.w / crop.w, out.h / crop.h);
    ctx.translate(-crop.x, -crop.y);
    paintTransformed(ctx, img, nat, source, state.turns, state.flipH, state.flipV);
    ctx.restore();

    const a = state.adjust;
    if (a.brightness !== 100 || a.contrast !== 100 || a.saturation !== 100) {
      const data = ctx.getImageData(0, 0, out.w, out.h);
      applyAdjustments(data.data, a);
      ctx.putImageData(data, 0, 0);
    }
    return toBlob(canvas, type, type === "image/png" ? undefined : state.quality);
  }

  let type = state.format;
  let blob = await render(type);
  if (!blob || blob.type !== type) {
    type = "image/jpeg";
    blob = await render(type);
  }
  if (!blob) throw new Error("encode");
  return { blob, width: out.w, height: out.h };
}

/** A File named after the original with the extension of the type that was actually produced. */
export function fileFromBlob(blob, originalName) {
  const base = String(originalName || "image").replace(/\.[^.]+$/, "") || "image";
  return new File([blob], `${base}.${EXT[blob.type] ?? "jpg"}`, { type: blob.type, lastModified: Date.now() });
}
