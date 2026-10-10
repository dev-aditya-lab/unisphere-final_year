"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/utils";

const variants = {
  on: { scale: [1, 1.38, 0.92, 1], rotate: [0, -14, 8, 0], transition: { duration: 0.42, ease: [0.22, 1, 0.36, 1] } },
  off: { scale: 1, rotate: 0, transition: { duration: 0.12 } },
};

/**
 * Wraps an icon so it "pops" when a toggle turns on (like, bookmark, follow). It stays still on first render,
 * and for reduced-motion members (the app root's MotionConfig turns transforms off).
 */
export function PopIcon({ active, className, children }) {
  return (
    <motion.span initial={false} animate={active ? "on" : "off"} variants={variants} className={cn("inline-grid place-items-center", className)}>
      {children}
    </motion.span>
  );
}
