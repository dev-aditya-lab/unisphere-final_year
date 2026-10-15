"use client";

import { m } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * A circle that draws itself, then a tick. Used for confirmed actions ("saved", "published", "verified").
 * Pure SVG path animation: about 450 ms, transform-free, and it renders fully drawn for reduced-motion users.
 */
export function AnimatedCheck({ className, size = 44, label = "Done" }) {
  return (
    <svg role="img" aria-label={label} viewBox="0 0 48 48" width={size} height={size} className={cn("text-success-text", className)} fill="none">
      <m.circle
        cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="3" strokeLinecap="round"
        initial={{ pathLength: 0, opacity: 0.4 }} animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      />
      <m.path
        d="M15 25.5 21.5 32 34 18" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
        transition={{ duration: 0.3, delay: 0.28, ease: [0.22, 1, 0.36, 1] }}
      />
    </svg>
  );
}
