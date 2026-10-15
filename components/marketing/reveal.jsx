"use client";

import { m } from "motion/react";

/**
 * Subtle fade-up on scroll. Reduced-motion users get no animation (MotionConfig in Providers).
 * Use `immediate` for anything above the fold: it renders visible in the server HTML, so the largest
 * paint never waits for JavaScript to start an animation.
 */
export function Reveal({ children, delay = 0, className, as = "div", immediate = false }) {
  if (immediate) {
    const Plain = as;
    return <Plain className={className}>{children}</Plain>;
  }
  const Comp = m[as] ?? m.div;
  return (
    <Comp
      className={className}
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.45, delay, ease: "easeOut" }}
    >
      {children}
    </Comp>
  );
}
