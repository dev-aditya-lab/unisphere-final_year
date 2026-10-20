// Draws an Orbit Card with the browser canvas. Text and layout are computed here from a card spec (see card-spec.js); the
// only images are the reward artwork (built in, or a badge picture an administrator uploaded) and the UniSphere mark. All of
// them are loaded from this site, so the canvas is never tainted: an uploaded picture comes through our own media route
// (`?proxy=1`), which streams the bytes, instead of the redirect to the storage domain a canvas cannot read.
// Client-only: it is imported lazily, when someone opens the preview.

import { rewardIconSrc } from "@/lib/orbits/icons";

export const CARD_FORMATS = {
  story: { label: "Story 9:16", width: 1080, height: 1920 },
  square: { label: "Square 1:1", width: 1080, height: 1080 },
};

const INDIGO = "#4F46E5";
const INK = "#111827";
const MUTED = "#5B6B82";

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${src}`));
    img.src = src;
  });
}

/** The badge picture: the administrator's upload when the spec has one, else the built-in artwork (also the fallback). */
export function badgeImage(badge) {
  const builtIn = () => loadImage(rewardIconSrc(badge));
  if (!badge?.imageKey) return builtIn();
  return loadImage(`/api/media/${badge.imageKey}?proxy=1`).catch(builtIn);
}

function wrap(ctx, text, maxWidth) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

/** Contain an image in a box without stretching it. */
function drawContain(ctx, img, x, y, w, h) {
  const scale = Math.min(w / img.width, h / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {object} spec  from buildCardSpec
 * @param {'story'|'square'} format
 * @param {string} fontFamily  the app's body font stack
 */
export async function drawCard(canvas, spec, format = "story", fontFamily = "system-ui, sans-serif") {
  const { width, height } = CARD_FORMATS[format];
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const [badge, orbit, mark] = await Promise.all([
    badgeImage(spec.badge),
    loadImage(rewardIconSrc({ name: "orbit" })),
    loadImage("/logo-mark.png").catch(() => null),
  ]);
  try {
    await Promise.all(["700 40px", "500 30px", "800 40px"].map((f) => document.fonts.load(`${f} ${fontFamily}`)));
  } catch {
    /* the fallback font is fine */
  }

  const tall = format === "story";
  const pad = 80;

  // Background: white with one soft indigo wash at the top, so the 3D artwork stays the focus.
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, width, height);
  const wash = ctx.createRadialGradient(width / 2, tall ? 560 : 380, 40, width / 2, tall ? 560 : 380, width * 0.75);
  wash.addColorStop(0, "rgba(79,70,229,0.16)");
  wash.addColorStop(1, "rgba(79,70,229,0)");
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, width, height);

  // Brand row
  const top = tall ? 110 : 70;
  if (mark) drawContain(ctx, mark, pad, top - 20, 72, 72);
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = INK;
  ctx.font = `800 44px ${fontFamily}`;
  ctx.fillText("UniSphere", pad + 92, top + 32);
  const orbitSize = 64;
  drawContain(ctx, orbit, width - pad - orbitSize - 150, top - 14, orbitSize, orbitSize);
  ctx.fillStyle = INDIGO;
  ctx.font = `700 40px ${fontFamily}`;
  ctx.textAlign = "right";
  ctx.fillText("Orbits", width - pad, top + 32);
  ctx.textAlign = "left";

  // Badge
  const badgeSize = tall ? 720 : 460;
  const badgeY = tall ? 400 : 190;
  drawContain(ctx, badge, (width - badgeSize) / 2, badgeY, badgeSize, badgeSize);

  // Text
  ctx.textAlign = "center";
  let y = badgeY + badgeSize + (tall ? 120 : 70);
  ctx.fillStyle = INK;
  ctx.font = `800 ${tall ? 76 : 64}px ${fontFamily}`;
  for (const line of wrap(ctx, spec.headline, width - pad * 2).slice(0, 3)) {
    ctx.fillText(line, width / 2, y);
    y += tall ? 92 : 78;
  }
  ctx.fillStyle = MUTED;
  ctx.font = `500 ${tall ? 38 : 34}px ${fontFamily}`;
  for (const line of wrap(ctx, spec.sub, width - pad * 2).slice(0, 2)) {
    y += 10;
    ctx.fillText(line, width / 2, y);
    y += tall ? 50 : 44;
  }

  if (spec.who) {
    y += tall ? 90 : 30;
    ctx.fillStyle = INK;
    ctx.font = `700 ${tall ? 50 : 40}px ${fontFamily}`;
    ctx.fillText(spec.who, width / 2, y);
    if (spec.handle) {
      y += 48;
      ctx.fillStyle = MUTED;
      ctx.font = `500 32px ${fontFamily}`;
      ctx.fillText(spec.handle, width / 2, y);
    }
  }

  // Footer
  ctx.fillStyle = MUTED;
  ctx.font = `500 30px ${fontFamily}`;
  ctx.fillText(spec.footer, width / 2, height - (tall ? 110 : 60));
  ctx.textAlign = "left";
  return canvas;
}

export function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not create the image"))), "image/png"));
}
