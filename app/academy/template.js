"use client";

import { m } from "motion/react";

// A short fade-and-rise when moving between Academy pages. Transform and opacity only, never blocks a click, and the app root's
// reduced-motion setting turns it into an instant change.
export default function AcademyTemplate({ children }) {
  return (
    <m.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}>
      {children}
    </m.div>
  );
}
