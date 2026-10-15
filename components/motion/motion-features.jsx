"use client";

import { LazyMotion, MotionConfig } from "motion/react";

// Motion's animation engine (about 30 KB gzipped, with shared layout) is fetched after hydration and only where the
// interface actually animates: the signed-in app and onboarding. Public pages use CSS for their reveals and never
// download it. Components use the light `m` element, which simply renders without animation where no engine is
// provided (the theme toggle on a public page, for example). `strict` makes a stray `motion.*` throw in development.
const loadMotionFeatures = () => import("@/lib/motion-features").then((mod) => mod.default);

export function MotionFeatures({ children }) {
  return (
    <LazyMotion features={loadMotionFeatures} strict>
      {/* Respect the member's reduced-motion preference for every animation inside the app */}
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
