import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { LANDING_IMAGES, landingImage } from "@/lib/landing/image-specs.mjs";

const root = process.cwd();
const base = (file) => file.replace(/\.jpg$/, "");

describe("landing page pictures", () => {
  it("lists each picture once, as a JPEG with a size", () => {
    const files = LANDING_IMAGES.map((i) => i.file);
    expect(new Set(files).size).toBe(files.length);
    for (const spec of LANDING_IMAGES) {
      expect(spec.file).toMatch(/^[a-z0-9-]+\.jpg$/);
      expect(spec.width).toBeGreaterThan(0);
      expect(spec.height).toBeGreaterThan(0);
      expect(landingImage(spec.file)).toBe(`/landing/${spec.file}`);
    }
  });

  it("has a file at exactly the stated size for every picture (run `npm run landing:images` if this fails)", async () => {
    for (const spec of LANDING_IMAGES) {
      const meta = await sharp(path.join(root, "public", "landing", spec.file)).metadata();
      expect([spec.file, meta.width, meta.height]).toEqual([spec.file, spec.width, spec.height]);
    }
  });

  it("documents every picture, so each one has a prompt to generate it", () => {
    const doc = fs.readFileSync(path.join(root, "docs", "LANDING_IMAGES.md"), "utf8");
    for (const spec of LANDING_IMAGES) expect(doc, spec.file).toContain(`\`${base(spec.file)}\``);
  });

  it("only uses pictures that are in the list (a typo would show a broken image)", () => {
    const known = new Set(LANDING_IMAGES.map((i) => i.file));
    const sources = ["app/(marketing)/page.js", "components/landing/hero-stage.jsx"].map((f) => fs.readFileSync(path.join(root, f), "utf8"));
    const used = sources.flatMap((s) => [...s.matchAll(/["']((?:hero|story|gallery|club)-[a-z]+\.jpg)["']/g)].map((m) => m[1]));
    expect(used.length).toBeGreaterThan(5);
    for (const file of used) expect(known.has(file), file).toBe(true);
    // and every listed picture is actually used somewhere
    for (const file of known) expect(used, file).toContain(file);
  });
});
