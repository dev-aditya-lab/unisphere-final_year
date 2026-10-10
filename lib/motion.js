/**
 * UniSphere motion language: one set of durations, easings and variants, so everything moves the same way.
 *
 * Principles
 *  - Motion explains: it shows what changed, where it came from, or that an action worked.
 *  - Fast and light: 120-250 ms for feedback, 200-400 ms for transitions. Only transform and opacity.
 *  - Never required: every animation has a still equivalent, and `prefers-reduced-motion` turns them off
 *    (the app root wraps everything in <MotionConfig reducedMotion="user">, and CSS honours the media query).
 */

export const DURATION = { instant: 0.08, fast: 0.14, base: 0.22, slow: 0.38 };

// Easings: "out" for things arriving, "inOut" for things moving between places, "spring" for playful feedback.
export const EASE = {
  out: [0.22, 1, 0.36, 1],
  inOut: [0.65, 0, 0.35, 1],
  spring: { type: "spring", stiffness: 520, damping: 30, mass: 0.7 },
  springSoft: { type: "spring", stiffness: 300, damping: 26 },
  pop: { type: "spring", stiffness: 700, damping: 18, mass: 0.6 },
};

/** A small rise-and-fade used when content first appears. */
export const rise = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: DURATION.slow, ease: EASE.out } },
};

/** Parent that staggers its children by a short step (use for the first screenful only, never long lists). */
export const stagger = (step = 0.05, delay = 0) => ({
  hidden: {},
  show: { transition: { staggerChildren: step, delayChildren: delay } },
});

export const fade = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: DURATION.base, ease: EASE.out } },
};

/** Scale-and-fade for popovers, menus and dialogs. */
export const popIn = {
  hidden: { opacity: 0, scale: 0.96, y: 4 },
  show: { opacity: 1, scale: 1, y: 0, transition: { duration: DURATION.base, ease: EASE.out } },
  exit: { opacity: 0, scale: 0.97, transition: { duration: DURATION.fast, ease: EASE.inOut } },
};

/** The tap feedback for the few things that are worth a spring (reactions, follow, bookmark). */
export const tapPop = { whileTap: { scale: 0.88 }, transition: EASE.pop };
