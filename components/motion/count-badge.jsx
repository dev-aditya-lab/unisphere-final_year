"use client";

import { AnimatePresence, motion } from "motion/react";
import { EASE } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * A small count pill whose number slides when it changes (new notification, new message).
 * Appears and disappears with a pop. Renders nothing at zero. `label` is announced to screen readers.
 */
export function CountBadge({ value, label = "unread", max = 99, className }) {
  const shown = value > max ? `${max}+` : String(value);
  return (
    <AnimatePresence initial={false}>
      {value > 0 && (
        <motion.span
          key="badge"
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.4, opacity: 0 }}
          transition={EASE.pop}
          className={cn("bg-accent-hot text-accent-hot-foreground inline-flex h-5 min-w-5 items-center justify-center overflow-hidden rounded-full px-1.5 text-[11px] leading-none font-bold tabular-nums", className)}
        >
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={shown}
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -10, opacity: 0 }}
              transition={{ duration: 0.18, ease: EASE.out }}
              aria-hidden="true"
            >
              {shown}
            </motion.span>
          </AnimatePresence>
          <span className="sr-only">
            {" "}
            {value} {label}
          </span>
        </motion.span>
      )}
    </AnimatePresence>
  );
}
