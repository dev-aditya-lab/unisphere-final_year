import { describe, expect, it } from "vitest";
import {
  MIN_CROP,
  applyAdjustments,
  cropToPixels,
  fitRect,
  formatBytes,
  moveRect,
  normalisedRatio,
  outputSize,
  resizeFromCorner,
  resizeFromEdge,
  rotatedSize,
  scaleRect,
} from "@/lib/images/geometry";

const inside = (r) => r.x >= -1e-9 && r.y >= -1e-9 && r.x + r.w <= 1 + 1e-9 && r.y + r.h <= 1 + 1e-9;

describe("rotation and ratios", () => {
  it("swaps width and height on odd quarter turns", () => {
    expect(rotatedSize(400, 300, 0)).toEqual({ w: 400, h: 300 });
    expect(rotatedSize(400, 300, 1)).toEqual({ w: 300, h: 400 });
    expect(rotatedSize(400, 300, 2)).toEqual({ w: 400, h: 300 });
    expect(rotatedSize(400, 300, 3)).toEqual({ w: 300, h: 400 });
  });

  it("converts a pixel aspect ratio to a normalised one", () => {
    // A square crop of a 2:1 image covers half the width and the full height.
    expect(normalisedRatio(1, 2000, 1000)).toBeCloseTo(0.5);
  });
});

describe("fitRect", () => {
  it("is the whole image for a free ratio", () => {
    expect(fitRect(null)).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });
  it("centres the largest rectangle of the requested shape", () => {
    const wide = fitRect(2);
    expect(wide.w).toBe(1);
    expect(wide.h).toBeCloseTo(0.5);
    expect(wide.y).toBeCloseTo(0.25);
    const tall = fitRect(0.5);
    expect(tall.w).toBeCloseTo(0.5);
    expect(tall.h).toBe(1);
    expect(tall.x).toBeCloseTo(0.25);
  });
});

describe("moving and scaling", () => {
  it("never leaves the image", () => {
    const r = { x: 0.2, y: 0.2, w: 0.5, h: 0.5 };
    expect(moveRect(r, 5, 5)).toMatchObject({ x: 0.5, y: 0.5 });
    expect(moveRect(r, -5, -5)).toMatchObject({ x: 0, y: 0 });
  });
  it("scales about the centre and keeps its ratio", () => {
    const r = { x: 0.25, y: 0.25, w: 0.5, h: 0.25 };
    const bigger = scaleRect(r, 1.5);
    expect(bigger.w / bigger.h).toBeCloseTo(2);
    expect(inside(bigger)).toBe(true);
    const huge = scaleRect(r, 10);
    expect(inside(huge)).toBe(true);
    expect(huge.w / huge.h).toBeCloseTo(2);
  });
});

describe("corner resize", () => {
  const r = { x: 0.25, y: 0.25, w: 0.5, h: 0.5 };
  it("keeps the opposite corner fixed (free)", () => {
    const out = resizeFromCorner(r, "se", 0.9, 0.6);
    expect(out.x).toBeCloseTo(0.25);
    expect(out.y).toBeCloseTo(0.25);
    expect(out.w).toBeCloseTo(0.65);
    expect(out.h).toBeCloseTo(0.35);
  });
  it("can be dragged past the anchor, flipping to the other side", () => {
    const out = resizeFromCorner(r, "se", 0.1, 0.1);
    expect(out.x).toBeCloseTo(0.1);
    expect(out.y).toBeCloseTo(0.1);
    expect(out.w).toBeCloseTo(0.15);
  });
  it("locks the ratio and stays inside the image", () => {
    const out = resizeFromCorner(r, "nw", -0.5, -0.5, 1);
    expect(inside(out)).toBe(true);
    expect(out.w / out.h).toBeCloseTo(1);
    expect(out.x + out.w).toBeCloseTo(0.75);
    expect(out.y + out.h).toBeCloseTo(0.75);
  });
  it("respects a minimum size", () => {
    const out = resizeFromCorner(r, "se", 0.25, 0.25);
    expect(out.w).toBeGreaterThanOrEqual(MIN_CROP - 1e-9);
    expect(out.h).toBeGreaterThanOrEqual(MIN_CROP - 1e-9);
  });
});

describe("edge resize", () => {
  const r = { x: 0.2, y: 0.2, w: 0.4, h: 0.4 };
  it("moves only the dragged edge", () => {
    expect(resizeFromEdge(r, "e", 0.9, 0)).toMatchObject({ x: 0.2, w: expect.closeTo(0.7) });
    expect(resizeFromEdge(r, "w", 0.1, 0)).toMatchObject({ x: 0.1, w: expect.closeTo(0.5) });
    expect(resizeFromEdge(r, "n", 0, 0.05)).toMatchObject({ y: 0.05, h: expect.closeTo(0.55) });
    expect(resizeFromEdge(r, "s", 0, 2)).toMatchObject({ y: 0.2, h: expect.closeTo(0.8) });
  });
  it("cannot collapse", () => {
    const out = resizeFromEdge(r, "e", 0, 0);
    expect(out.w).toBeCloseTo(MIN_CROP);
  });
});

describe("pixels and output size", () => {
  it("rounds a crop to whole pixels inside the image", () => {
    expect(cropToPixels({ x: 0.1, y: 0.1, w: 1, h: 1 }, 1000, 500)).toEqual({ x: 100, y: 50, w: 900, h: 450 });
  });
  it("downsizes the longest edge and never upscales", () => {
    expect(outputSize(4000, 3000, 1280)).toEqual({ w: 1280, h: 960, scale: 0.32 });
    expect(outputSize(3000, 4000, 800)).toMatchObject({ w: 600, h: 800 });
    expect(outputSize(500, 400, 1280)).toEqual({ w: 500, h: 400, scale: 1 });
    expect(outputSize(500, 400, null)).toEqual({ w: 500, h: 400, scale: 1 });
  });
});

describe("adjustments", () => {
  it("leaves pixels alone at the defaults", () => {
    const px = new Uint8ClampedArray([10, 20, 30, 255]);
    applyAdjustments(px, { brightness: 100, contrast: 100, saturation: 100 });
    expect(Array.from(px)).toEqual([10, 20, 30, 255]);
  });
  it("brightens", () => {
    const px = new Uint8ClampedArray([100, 100, 100, 255]);
    applyAdjustments(px, { brightness: 150 });
    expect(Array.from(px)).toEqual([150, 150, 150, 255]);
  });
  it("removes colour at zero saturation", () => {
    const px = new Uint8ClampedArray([200, 50, 50, 255]);
    applyAdjustments(px, { saturation: 0 });
    expect(px[0]).toBe(px[1]);
    expect(px[1]).toBe(px[2]);
  });
  it("pushes values away from mid-grey with more contrast", () => {
    const px = new Uint8ClampedArray([200, 200, 200, 255, 50, 50, 50, 255]);
    applyAdjustments(px, { contrast: 150 });
    expect(px[0]).toBeGreaterThan(200);
    expect(px[4]).toBeLessThan(50);
  });
});

describe("formatBytes", () => {
  it("is readable", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});
