import { describe, expect, it } from "vitest";
import { DEFAULT_RATIO, TALLEST_FRAME, frameRatio } from "@/lib/images/frame";

describe("frameRatio", () => {
  it("snaps landscape and square pictures to 16:9, 3:2, 4:3 or 1:1", () => {
    expect(frameRatio(1920, 1080)).toBeCloseTo(16 / 9);
    expect(frameRatio(1600, 900)).toBeCloseTo(16 / 9);
    expect(frameRatio(3000, 2000)).toBeCloseTo(3 / 2); // a typical camera photo
    expect(frameRatio(4000, 3000)).toBeCloseTo(4 / 3); // a typical phone photo
    expect(frameRatio(1000, 1000)).toBe(1);
    expect(frameRatio(1100, 1000)).toBe(1); // nearer to square than to 4:3
    expect(frameRatio(1400, 1000)).toBeCloseTo(4 / 3); // 1.4 is nearer to 4:3 than to 3:2
  });

  it("limits a panorama to 16:9", () => {
    expect(frameRatio(6000, 1000)).toBeCloseTo(16 / 9);
  });

  it("lets a portrait picture keep its own shape, down to 3:4", () => {
    expect(frameRatio(800, 1000)).toBeCloseTo(0.8);
    expect(frameRatio(3000, 4000)).toBeCloseTo(TALLEST_FRAME);
    expect(frameRatio(900, 1600)).toBeCloseTo(TALLEST_FRAME); // a phone screenshot is cropped in the feed
    expect(frameRatio(950, 1000)).toBe(1); // almost square
  });

  it("falls back to 4:3 when the size is not known", () => {
    for (const [w, h] of [[null, null], [0, 100], [100, 0], [undefined, 5], [-1, 4]]) expect(frameRatio(w, h)).toBe(DEFAULT_RATIO);
  });
});
