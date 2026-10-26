// Builds public/landing/* from lib/landing/image-specs.mjs.
//
//   npm run landing:images
//
// For each picture: if a source image with the same base name exists in assets/landing-source/ (png, jpg, jpeg or webp, any
// size) it is cropped to the page's size and compressed; otherwise a flat placeholder is drawn so the page still looks
// finished. Run it again whenever a source image is added or replaced. Nothing else needs to change.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { LANDING_IMAGES } from "../lib/landing/image-specs.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_DIR = path.join(root, "assets", "landing-source");
const OUT_DIR = path.join(root, "public", "landing");
const EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp"];

// Flat colours, no gradients: black, graphite and paper, each with the one blue accent. [ground, building, window, accent, label]
const TONES = {
  ink: ["#0f0f0f", "#1d1d1d", "#3b3b3b", "#2f63f0", "#ffffff"],
  graphite: ["#262626", "#383838", "#5a5a5a", "#2f63f0", "#ffffff"],
  paper: ["#e8e7e1", "#d0cfc7", "#f7f6f1", "#2f63f0", "#0a0a0a"],
};

function placeholderSvg({ file, width, height, tone }) {
  const [ground, building, window, accent, label] = TONES[tone] ?? TONES.ink;
  const unit = Math.round(Math.min(width, height) / 14);
  const horizon = Math.round(height * 0.74);
  const parts = [`<rect width="${width}" height="${height}" fill="${ground}"/>`];
  // A flat sun, set on a fixed line so every placeholder reads as the same family.
  parts.push(`<circle cx="${Math.round(width * 0.74)}" cy="${Math.round(height * 0.22)}" r="${unit * 1.6}" fill="${accent}"/>`);
  // Three blocks of building with a regular grid of windows.
  const blocks = [
    [0.08, 0.34, 0.26],
    [0.36, 0.5, 0.34],
    [0.72, 0.28, 0.22],
  ];
  blocks.forEach(([x, h, w]) => {
    const bx = Math.round(width * x);
    const bw = Math.round(width * w);
    const bh = Math.round(height * h);
    parts.push(`<rect x="${bx}" y="${horizon - bh}" width="${bw}" height="${bh}" fill="${building}"/>`);
    const cols = Math.max(2, Math.floor(bw / (unit * 1.6)));
    const rows = Math.max(2, Math.floor(bh / (unit * 1.7)));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const wx = bx + Math.round(unit * 0.5) + c * Math.round((bw - unit) / cols);
        const wy = horizon - bh + Math.round(unit * 0.55) + r * Math.round((bh - unit) / rows);
        parts.push(`<rect x="${wx}" y="${wy}" width="${Math.round(unit * 0.6)}" height="${Math.round(unit * 0.7)}" fill="${window}" opacity="${(r + c) % 3 === 0 ? 1 : 0.55}"/>`);
      }
    }
  });
  parts.push(`<rect x="0" y="${horizon}" width="${width}" height="${height - horizon}" fill="${building}"/>`);
  parts.push(`<rect x="0" y="${horizon}" width="${width}" height="${Math.max(2, Math.round(unit * 0.08))}" fill="${accent}"/>`);
  // The label that says what this is, and what replaces it.
  const size = Math.max(14, Math.round(unit * 0.5));
  parts.push(
    `<text x="${Math.round(unit * 1.6)}" y="${height - Math.round(unit * 1.9)}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="700" letter-spacing="2" fill="${label}" opacity="0.92">PLACEHOLDER</text>`,
    `<text x="${Math.round(unit * 1.6)}" y="${height - Math.round(unit * 1.1)}" font-family="Arial, Helvetica, sans-serif" font-size="${Math.round(size * 0.82)}" fill="${label}" opacity="0.7">${file}  ·  ${width} × ${height}</text>`,
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${parts.join("")}</svg>`;
}

async function findSource(file) {
  const base = path.parse(file).name;
  for (const ext of EXTENSIONS) {
    const candidate = path.join(SOURCE_DIR, base + ext);
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // try the next extension
    }
  }
  return null;
}

await fs.mkdir(OUT_DIR, { recursive: true });
await fs.mkdir(SOURCE_DIR, { recursive: true });

let fromSource = 0;
for (const spec of LANDING_IMAGES) {
  const out = path.join(OUT_DIR, spec.file);
  const source = await findSource(spec.file);
  const input = source ?? Buffer.from(placeholderSvg(spec));
  await sharp(input)
    .rotate()
    .resize(spec.width, spec.height, { fit: "cover", position: sharp.strategy.attention })
    .jpeg({ quality: source ? 82 : 86, mozjpeg: true, progressive: true })
    .toFile(out);
  const { size } = await fs.stat(out);
  if (source) fromSource++;
  console.log(`${source ? "photo      " : "placeholder"}  ${spec.file.padEnd(24)} ${spec.width}x${spec.height}  ${(size / 1024).toFixed(0)} KB`);
}
console.log(`\n${fromSource} from assets/landing-source, ${LANDING_IMAGES.length - fromSource} placeholders.`);
