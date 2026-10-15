// Pure maths for the client-side image editor (crop, rotate, resize, adjust). No DOM, so it is unit-tested in Node.
//
// Coordinates: a crop rectangle is {x, y, w, h} in 0..1 of the *transformed* image (after rotation), so it does not
// depend on how large the preview is drawn.

export const MIN_CROP = 0.04;

/** Size presets for the longest edge of the saved image. `null` keeps the cropped size. */
export const SIZE_PRESETS = [
  { id: "original", label: "Original size", edge: null },
  { id: "large", label: "Large", edge: 2048 },
  { id: "medium", label: "Medium", edge: 1280 },
  { id: "small", label: "Small", edge: 800 },
];

/** Longest-edge presets for profile photos and covers (displayed small, so they do not need to be large). */
export const AVATAR_SIZES = [
  { id: "large", label: "Large", edge: 1024 },
  { id: "medium", label: "Medium", edge: 512 },
  { id: "small", label: "Small", edge: 256 },
];
export const COVER_SIZES = [
  { id: "large", label: "Large", edge: 1920 },
  { id: "medium", label: "Medium", edge: 1280 },
  { id: "small", label: "Small", edge: 960 },
];

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Dimensions after turning the image by `turns` quarter turns (0..3). */
export function rotatedSize(w, h, turns) {
  return turns % 2 === 0 ? { w, h } : { w: h, h: w };
}

/** Normalised width/height ratio of a crop for a pixel aspect ratio on an image of W by H pixels. */
export function normalisedRatio(aspect, W, H) {
  return (aspect * H) / W;
}

/** The largest centred rectangle with normalised ratio `ar` (width / height) inside the unit square. */
export function fitRect(ar) {
  if (!ar || !Number.isFinite(ar) || ar <= 0) return { x: 0, y: 0, w: 1, h: 1 };
  const w = Math.min(1, ar);
  const h = w / ar;
  return { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
}

/** Moves a rectangle by (dx, dy), keeping it inside the image. */
export function moveRect(r, dx, dy) {
  return { ...r, x: clamp(r.x + dx, 0, 1 - r.w), y: clamp(r.y + dy, 0, 1 - r.h) };
}

/**
 * Resizes by dragging one corner (`corner` is "nw" | "ne" | "sw" | "se"). The opposite corner stays put. With `ar`
 * (normalised ratio) the shape is locked; otherwise the corner moves freely. (px, py) is the pointer in 0..1.
 */
export function resizeFromCorner(r, corner, px, py, ar = null) {
  const ax = corner.includes("w") ? r.x + r.w : r.x;
  const ay = corner.includes("n") ? r.y + r.h : r.y;
  const toRight = px >= ax;
  const toBottom = py >= ay;
  const roomW = toRight ? 1 - ax : ax;
  const roomH = toBottom ? 1 - ay : ay;
  let w = Math.abs(px - ax);
  let h = Math.abs(py - ay);
  if (ar) {
    w = Math.max(w, h * ar);
    w = Math.min(w, roomW, roomH * ar);
    w = Math.max(w, Math.min(MIN_CROP, roomW, roomH * ar));
    h = w / ar;
  } else {
    w = clamp(w, Math.min(MIN_CROP, roomW), roomW);
    h = clamp(h, Math.min(MIN_CROP, roomH), roomH);
  }
  return { x: toRight ? ax : ax - w, y: toBottom ? ay : ay - h, w, h };
}

/** Resizes by dragging one edge ("n" | "s" | "e" | "w") of a free-aspect crop. */
export function resizeFromEdge(r, edge, px, py) {
  let { x, y, w, h } = r;
  if (edge === "e") w = clamp(px - x, MIN_CROP, 1 - x);
  if (edge === "s") h = clamp(py - y, MIN_CROP, 1 - y);
  if (edge === "w") {
    const right = x + w;
    x = clamp(px, 0, right - MIN_CROP);
    w = right - x;
  }
  if (edge === "n") {
    const bottom = y + h;
    y = clamp(py, 0, bottom - MIN_CROP);
    h = bottom - y;
  }
  return { x, y, w, h };
}

/** Grows or shrinks about the centre (keyboard +/-). Keeps the ratio. */
export function scaleRect(r, factor) {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  let w = clamp(r.w * factor, MIN_CROP, 1);
  let h = (w / r.w) * r.h;
  if (h > 1) {
    h = 1;
    w = (h / r.h) * r.w;
  }
  return { x: clamp(cx - w / 2, 0, 1 - w), y: clamp(cy - h / 2, 0, 1 - h), w, h };
}

/** Crop rectangle in whole pixels of a W by H image. */
export function cropToPixels(r, W, H) {
  const x = clamp(Math.round(r.x * W), 0, W - 1);
  const y = clamp(Math.round(r.y * H), 0, H - 1);
  const w = clamp(Math.round(r.w * W), 1, W - x);
  const h = clamp(Math.round(r.h * H), 1, H - y);
  return { x, y, w, h };
}

/** Output size for a crop and a longest-edge target. Never upscales. */
export function outputSize(cropW, cropH, edge) {
  const longest = Math.max(cropW, cropH);
  if (!edge || edge >= longest) return { w: cropW, h: cropH, scale: 1 };
  const scale = edge / longest;
  return { w: Math.max(1, Math.round(cropW * scale)), h: Math.max(1, Math.round(cropH * scale)), scale };
}

/**
 * Brightness, contrast and saturation on RGBA bytes, using the same formulas as the CSS filters the preview uses,
 * so what you see is what is saved. Values are percentages (100 = unchanged).
 */
export function applyAdjustments(data, { brightness = 100, contrast = 100, saturation = 100 }) {
  if (brightness === 100 && contrast === 100 && saturation === 100) return data;
  const b = brightness / 100;
  const c = contrast / 100;
  const s = saturation / 100;
  const offset = (0.5 - 0.5 * c) * 255;
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i] * b;
    let g = data[i + 1] * b;
    let bl = data[i + 2] * b;
    r = r * c + offset;
    g = g * c + offset;
    bl = bl * c + offset;
    const lum = 0.213 * r + 0.715 * g + 0.072 * bl;
    data[i] = lum + (r - lum) * s;
    data[i + 1] = lum + (g - lum) * s;
    data[i + 2] = lum + (bl - lum) * s;
  }
  return data;
}

export function formatBytes(n) {
  if (!Number.isFinite(n)) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
