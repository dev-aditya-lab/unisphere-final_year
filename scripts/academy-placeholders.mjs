// Writes the placeholder pictures for the Academy home page to public/academy/*.svg.
//   node scripts/academy-placeholders.mjs
// They are plain grey drawings of product screens (a course player, a mentor's review, a certificate), not photographs, and each says
// "Placeholder" in a corner. Replace any of them by saving your own picture over the file with the same name (an .svg, or change the
// extension in components/academy/landing/pictures.js). Nothing here shows real people, results or numbers.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "academy");
mkdirSync(out, { recursive: true });

const FONT = "Inter, 'Segoe UI', system-ui, sans-serif";
const aurora = (id) => `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b6ee0"/><stop offset="1" stop-color="#1d4ed8"/></linearGradient>`;
const mesh = (w, h) => `
  <rect width="${w}" height="${h}" fill="#e8edf6"/>
  <rect x="0" y="${h * 0.7}" width="${w}" height="${h * 0.3}" fill="#dde4f0"/>`;
const defs = `<defs><filter id="bl" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="90"/></filter>${aurora("au")}</defs>`;
const mark = (w, h) => `<text x="${w - 24}" y="${h - 22}" text-anchor="end" font-family="${FONT}" font-size="15" fill="#0b0f19" opacity=".4" letter-spacing="1.5">PLACEHOLDER</text>`;
const lines = (x, y, widths, gap = 22, color = "#fff", op = 0.18, h = 9) => widths.map((w, i) => `<rect x="${x}" y="${y + i * gap}" width="${w}" height="${h}" rx="${h / 2}" fill="${color}" opacity="${op}"/>`).join("");
const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="Placeholder illustration">${defs}${body}${mark(w, h)}</svg>`;

const files = {};

// 1. The hero: a laptop showing a course player
files["hero-laptop"] = svg(1600, 1000, `${mesh(1600, 1000)}
  <rect x="230" y="110" width="1140" height="700" rx="34" fill="#0d0d12" stroke="#2a2a33" stroke-width="3"/>
  <rect x="262" y="142" width="1076" height="636" rx="14" fill="#101016"/>
  <rect x="262" y="142" width="1076" height="52" rx="14" fill="#16161d"/>
  <circle cx="294" cy="168" r="7" fill="#3a3a3a"/><circle cx="318" cy="168" r="7" fill="#3a3a3a"/><circle cx="342" cy="168" r="7" fill="#3a3a3a"/>
  <rect x="262" y="194" width="280" height="584" fill="#13131a"/>
  ${lines(290, 226, [180, 210, 150, 196, 170, 200, 140], 34, "#fff", 0.16, 12)}
  <rect x="290" y="226" width="196" height="12" rx="6" fill="url(#au)"/>
  <rect x="580" y="226" width="720" height="360" rx="18" fill="url(#au)" opacity=".85"/>
  <circle cx="940" cy="406" r="46" fill="#000" opacity=".35"/><path d="M926 382 L966 406 L926 430Z" fill="#fff"/>
  <rect x="580" y="610" width="720" height="8" rx="4" fill="#fff" opacity=".12"/><rect x="580" y="610" width="430" height="8" rx="4" fill="url(#au)"/>
  ${lines(580, 650, [420, 560, 340], 32, "#fff", 0.2, 12)}
  <path d="M120 850 H1480 L1420 900 H180Z" fill="#17171d" stroke="#2a2a33" stroke-width="3"/>`);

// 2-5. The four steps of the story
const card = (x, y, w, h, fill = "#13131a") => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="26" fill="${fill}" stroke="#ffffff" stroke-opacity=".08"/>`;
files["story-1"] = svg(1200, 900, `${mesh(1200, 900, "#f5f5f7", "#d2d2d7", "#ffffff")}
  ${[0, 1, 2].map((i) => `${card(110 + i * 330, 220 + (i === 1 ? -40 : 20), 300, 420)}
    <rect x="${130 + i * 330}" y="${240 + (i === 1 ? -40 : 20)}" width="260" height="170" rx="16" fill="url(#au)" opacity="${0.9 - i * 0.18}"/>
    ${lines(130 + i * 330, 440 + (i === 1 ? -40 : 20), [200, 150], 28, "#fff", 0.35, 12)}${lines(130 + i * 330, 510 + (i === 1 ? -40 : 20), [90], 28, "#ffffff", 0.8, 12)}`).join("")}`);
files["story-2"] = svg(1200, 900, `${mesh(1200, 900, "#d2d2d7", "#f5f5f7", "#a1a1a6")}
  ${card(150, 150, 900, 600, "#0e0e14")}
  <rect x="150" y="150" width="900" height="56" rx="26" fill="#16161d"/>
  ${["#d2d2d7", "#f5f5f7", "#ffffff", "#86868b", "#a1a1a6", "#f5f5f7", "#d2d2d7"].map((c, i) => `<rect x="190" y="${250 + i * 62}" width="${[380, 520, 300, 440, 560, 260, 400][i]}" height="14" rx="7" fill="${c}" opacity=".75"/>`).join("")}
  <rect x="190" y="690" width="14" height="30" rx="3" fill="#fff" opacity=".9"/>`);
files["story-3"] = svg(1200, 900, `${mesh(1200, 900, "#a1a1a6", "#d2d2d7", "#86868b")}
  ${card(160, 140, 880, 620, "#101016")}
  ${["Correctness", "Code quality", "Documentation", "Completeness"].map((l, i) => `<text x="210" y="${252 + i * 100}" font-family="${FONT}" font-size="26" fill="#fff" opacity=".85">${l}</text><rect x="210" y="${270 + i * 100}" width="640" height="14" rx="7" fill="#fff" opacity=".12"/><rect x="210" y="${270 + i * 100}" width="${[560, 470, 380, 520][i]}" height="14" rx="7" fill="url(#au)"/>`).join("")}
  <rect x="210" y="640" width="780" height="76" rx="18" fill="#fff" opacity=".07"/>${lines(236, 662, [520, 340], 22, "#fff", 0.4, 9)}`);
const qr = Array.from({ length: 81 }, (_, i) => ((i * 7 + (i % 9) * 5 + (i >> 3)) % 3 !== 0));
files["story-4"] = svg(1200, 900, `${mesh(1200, 900, "#86868b", "#a1a1a6", "#d2d2d7")}
  <g transform="rotate(-4 600 450)"><rect x="170" y="190" width="860" height="520" rx="22" fill="#fbfbfd"/>
  <rect x="170" y="190" width="860" height="14" rx="7" fill="url(#au)"/>
  <text x="230" y="290" font-family="${FONT}" font-size="22" letter-spacing="5" fill="#6e6e73">CERTIFICATE OF COMPLETION</text>
  <text x="230" y="390" font-family="${FONT}" font-size="64" font-weight="700" fill="#1d1d1f" letter-spacing="-2">Your name here</text>
  ${lines(230, 430, [420, 300], 28, "#1d1d1f", 0.15, 12)}
  <text x="230" y="640" font-family="monospace" font-size="22" fill="#6e6e73">US-2026-WD-00000</text>
  <g transform="translate(790 440)">${qr.map((on, i) => (on ? `<rect x="${(i % 9) * 22}" y="${Math.floor(i / 9) * 22}" width="20" height="20" rx="3" fill="#1d1d1f"/>` : "")).join("")}</g></g>`);

// 6-11. Showcase cards (tall)
const tall = (name, a, b, c, body) => (files[name] = svg(800, 1000, `${mesh(800, 1000, a, b, c)}${body}`));
tall("show-courses", "#f5f5f7", "#ffffff", "#d2d2d7", `${card(120, 260, 560, 440)}<rect x="150" y="290" width="500" height="220" rx="18" fill="url(#au)" opacity=".85"/>${lines(150, 550, [360, 260], 30, "#fff", 0.4, 14)}<rect x="150" y="630" width="140" height="40" rx="20" fill="#fff" opacity=".9"/>`);
tall("show-programs", "#d2d2d7", "#a1a1a6", "#f5f5f7", `${[0, 1, 2].map((i) => `${card(140 + i * 30, 230 + i * 120, 520, 150)}<circle cx="${200 + i * 30}" cy="${305 + i * 120}" r="26" fill="url(#au)"/>${lines(250 + i * 30, 285 + i * 120, [300, 200], 28, "#fff", 0.35, 13)}`).join("")}`);
tall("show-internships", "#86868b", "#a1a1a6", "#d2d2d7", `${card(110, 250, 580, 500)}${lines(150, 300, [380, 460, 300, 420], 56, "#fff", 0.25, 16)}<rect x="150" y="560" width="500" height="120" rx="18" fill="url(#au)" opacity=".75"/>`);
tall("show-live", "#ffffff", "#f5f5f7", "#d2d2d7", `${card(110, 240, 580, 340, "#0d0d12")}<circle cx="400" cy="400" r="70" fill="url(#au)" opacity=".9"/><circle cx="400" cy="400" r="110" fill="none" stroke="#fff" stroke-opacity=".18" stroke-width="3"/><circle cx="400" cy="400" r="150" fill="none" stroke="#fff" stroke-opacity=".08" stroke-width="3"/>${[0, 1, 2].map((i) => `<circle cx="${200 + i * 200}" cy="650" r="44" fill="#fff" opacity=".16"/>`).join("")}`);
tall("show-mentors", "#a1a1a6", "#86868b", "#d2d2d7", `${card(110, 230, 580, 540)}${[0, 1, 2].map((i) => `<rect x="150" y="${270 + i * 160}" width="500" height="130" rx="20" fill="#fff" opacity=".07"/><circle cx="205" cy="${335 + i * 160}" r="30" fill="url(#au)"/>${lines(260, 310 + i * 160, [300, 220], 30, "#fff", 0.35, 13)}`).join("")}`);
tall("show-verify", "#d2d2d7", "#ffffff", "#f5f5f7", `${card(120, 260, 560, 480)}<circle cx="400" cy="420" r="84" fill="none" stroke="url(#au)" stroke-width="14"/><path d="M360 424 L392 456 L450 388" fill="none" stroke="#ffffff" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>${lines(190, 580, [420, 300], 34, "#fff", 0.3, 14)}`);

for (const [name, content] of Object.entries(files)) writeFileSync(join(out, `${name}.svg`), content);
console.log(`wrote ${Object.keys(files).length} placeholder pictures to public/academy/`);
