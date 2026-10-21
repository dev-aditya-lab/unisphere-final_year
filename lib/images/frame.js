// The frame a post picture is drawn in. A single picture takes the nearest of the four familiar shapes (16:9, 3:2, 4:3
// or square), so a feed of mixed photos looks tidy and a landscape photo is barely cropped. A portrait picture keeps its
// own shape down to 3:4, because squeezing a tall photo into a square throws away much of it. Anything more extreme is
// cropped to the nearest limit in the feed and shown in full when it is opened (the lightbox in post-media.jsx).
// Pure maths with no DOM, so it is unit-tested in Node.

/** Landscape and square shapes a picture can be snapped to, widest first. */
export const SNAP_RATIOS = [
  { label: "16:9", ratio: 16 / 9 },
  { label: "3:2", ratio: 3 / 2 },
  { label: "4:3", ratio: 4 / 3 },
  { label: "1:1", ratio: 1 },
];

/** The tallest frame (width over height) a portrait picture gets in the feed. */
export const TALLEST_FRAME = 3 / 4;

/** Used until the real size is known (images uploaded before sizes were recorded), and for a size that makes no sense. */
export const DEFAULT_RATIO = 4 / 3;

/** Width over height of the feed frame for a picture of `width` by `height` pixels. */
export function frameRatio(width, height) {
  if (!(width > 0) || !(height > 0)) return DEFAULT_RATIO;
  const r = width / height;
  if (r < 1) return r > 0.9 ? 1 : Math.max(r, TALLEST_FRAME);
  let best = SNAP_RATIOS[0];
  for (const s of SNAP_RATIOS) if (Math.abs(Math.log(r / s.ratio)) < Math.abs(Math.log(r / best.ratio))) best = s;
  return best.ratio;
}
