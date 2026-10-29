"use client";

import { m } from "motion/react";

/**
 * Scroll-triggered entrance: the block fades and rises once, the first time it is in view. Opacity and transform only, no scroll
 * hijacking. The app root turns this into an instant appearance for people who ask for reduced motion.
 */
export function Reveal({ children, delay = 0, y = 18, className, as = "div", once = true }) {
  const Tag = m[as] ?? m.div;
  return (
    <Tag className={className} initial={{ opacity: 0, y }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once, margin: "0px 0px -8% 0px" }} transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}>
      {children}
    </Tag>
  );
}

/** Children enter one after another (use for a row of cards, not for long lists). */
export function RevealGroup({ children, className, step = 0.08 }) {
  return (
    <m.div className={className} initial="hidden" whileInView="show" viewport={{ once: true, margin: "0px 0px -8% 0px" }} variants={{ hidden: {}, show: { transition: { staggerChildren: step } } }}>
      {children}
    </m.div>
  );
}

export function RevealItem({ children, className, y = 16 }) {
  return (
    <m.div className={className} variants={{ hidden: { opacity: 0, y }, show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] } } }}>
      {children}
    </m.div>
  );
}
