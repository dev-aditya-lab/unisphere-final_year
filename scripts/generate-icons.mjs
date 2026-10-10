// Generates the installable-app icons from the real logo (public/unisphereLogo.png).
//   node scripts/generate-icons.mjs
// Output: public/icons/{icon-192,icon-512,maskable-512,badge-96}.png and app/apple-icon.png (180px, opaque).
import { mkdirSync } from "node:fs";
import sharp from "sharp";

const SOURCE = "public/unisphereLogo.png";
const IVORY = { r: 251, g: 246, b: 236, alpha: 1 };
mkdirSync("public/icons", { recursive: true });

/** The logo centred on a solid ivory tile. `scale` is how much of the tile the logo may fill. */
async function tile(size, scale, { rounded = false } = {}) {
  const inner = Math.round(size * scale);
  const logo = await sharp(SOURCE).resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  let img = sharp({ create: { width: size, height: size, channels: 4, background: IVORY } }).composite([{ input: logo, gravity: "center" }]);
  if (rounded) {
    const mask = Buffer.from(`<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${Math.round(size * 0.22)}" fill="#fff"/></svg>`);
    img = sharp(await img.png().toBuffer()).composite([{ input: mask, blend: "dest-in" }]);
  }
  return img.png().toBuffer();
}

const outputs = [
  ["public/icons/icon-192.png", 192, 0.78, { rounded: true }],
  ["public/icons/icon-512.png", 512, 0.78, { rounded: true }],
  // Maskable icons are cropped to a circle or squircle by the OS: keep the logo inside the central 60% "safe zone".
  ["public/icons/maskable-512.png", 512, 0.58, {}],
  ["app/apple-icon.png", 180, 0.74, {}],
];
for (const [file, size, scale, opts] of outputs) {
  await sharp(await tile(size, scale, opts)).toFile(file);
  console.log(`wrote ${file}`);
}

// Monochrome status-bar badge for push notifications (Android uses only the alpha channel).
const alphaMask = await sharp(SOURCE)
  .resize(96, 96, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .ensureAlpha()
  .extractChannel("alpha")
  .toBuffer();
await sharp({ create: { width: 96, height: 96, channels: 3, background: { r: 255, g: 255, b: 255 } } })
  .joinChannel(alphaMask)
  .png()
  .toFile("public/icons/badge-96.png");
console.log("wrote public/icons/badge-96.png");
