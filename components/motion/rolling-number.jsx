"use client";

import { useState } from "react";
import { AnimatePresence, m } from "motion/react";
import { compactNumber } from "@/lib/format";
import { EASE } from "@/lib/motion";
import { cn } from "@/lib/utils";

const variants = {
  enter: (dir) => ({ y: dir * 9, opacity: 0 }),
  center: { y: 0, opacity: 1 },
  exit: (dir) => ({ y: dir * -9, opacity: 0 }),
};

/**
 * A counter whose digits slide when the number changes: up when it grows, down when it shrinks (the odometer cue that
 * tells you a like landed, or was taken back). Nothing plays on first render. The visible text is hidden from assistive
 * technology while it animates, so the number is read once, from the stable copy.
 */
export function RollingNumber({ value, format = compactNumber, className }) {
  // Derived during render (not an effect), so the direction is known on the very render that swaps the number.
  const [seen, setSeen] = useState({ value, dir: 1 });
  if (seen.value !== value) setSeen({ value, dir: value >= seen.value ? 1 : -1 });
  const shown = format(value);
  return (
    <span className={cn("relative inline-flex overflow-hidden tabular-nums", className)}>
      <span className="sr-only">{shown}</span>
      <AnimatePresence mode="popLayout" initial={false} custom={seen.dir}>
        <m.span key={shown} custom={seen.dir} variants={variants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.2, ease: EASE.out }} aria-hidden="true">
          {shown}
        </m.span>
      </AnimatePresence>
    </span>
  );
}
