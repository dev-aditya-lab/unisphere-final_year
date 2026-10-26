"use client";

import { useEffect, useRef } from "react";
import { animate, useInView, useReducedMotion } from "motion/react";

/**
 * A number that counts up to its value the first time it scrolls into view. The server renders the final value, so it reads
 * correctly with no script, to a search engine and for anyone who prefers reduced motion; the count only plays when motion is
 * allowed. Writes straight to the text node (no state), so it re-renders nothing.
 */
export function CountUp({ to, className }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -12% 0px" });
  const reduce = useReducedMotion();

  useEffect(() => {
    const node = ref.current;
    if (!inView || reduce || !node) return;
    const controls = animate(0, to, {
      duration: 1.8,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (value) => {
        node.textContent = String(Math.round(value));
      },
      onComplete: () => {
        node.textContent = String(to);
      },
    });
    return () => controls.stop();
  }, [inView, reduce, to]);

  return (
    <span ref={ref} className={className}>
      {to}
    </span>
  );
}
