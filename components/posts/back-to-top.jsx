"use client";

import { AnimatePresence, m } from "motion/react";
import { ArrowUp } from "lucide-react";
import { useScrollState } from "@/hooks/use-scroll-state";
import { EASE } from "@/lib/motion";

/**
 * "Back to top", offered only when it helps: far down a long feed and scrolling up (the moment someone wants the start again).
 * It hangs under the sticky tab bar, centred, so it never covers a post's actions or the tab bar of the phone.
 */
export function BackToTop() {
  const { deep, hidden } = useScrollState();
  const show = deep && !hidden;
  return (
    <AnimatePresence>
      {show && (
        <m.button
          type="button"
          initial={{ opacity: 0, y: -10, scale: 0.92 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.92 }}
          transition={{ duration: 0.2, ease: EASE.out }}
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="bg-foreground text-background shadow-pop focus-visible:ring-ring/50 fixed top-[calc(3.5rem+2.75rem+env(safe-area-inset-top)+0.75rem)] left-1/2 z-20 flex h-9 -translate-x-1/2 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold outline-none focus-visible:ring-[3px] lg:ml-32"
        >
          <ArrowUp className="size-4" aria-hidden="true" />
          Back to top
        </m.button>
      )}
    </AnimatePresence>
  );
}
