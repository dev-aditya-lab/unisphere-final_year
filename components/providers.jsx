"use client";

import { ThemeProvider } from "@/components/theme-provider";
import { LazyMotion, MotionConfig } from "motion/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { PwaProvider } from "@/components/pwa/pwa-provider";

// Motion's animation engine is loaded after the page is interactive instead of inside the first bundle. Components use
// the light `m` element, which renders normally until the features arrive. `strict` makes any stray `motion.*`
// element throw in development, so nothing quietly pulls the full engine back into the main bundle.
const loadMotionFeatures = () => import("@/lib/motion-features").then((mod) => mod.default);

export function Providers({ children }) {
  return (
    <ThemeProvider>
      <LazyMotion features={loadMotionFeatures} strict>
        {/* Respect the user's reduced-motion preference for every animation */}
        <MotionConfig reducedMotion="user">
          <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
        </MotionConfig>
      </LazyMotion>
      <PwaProvider />
      <Toaster position="bottom-right" />
    </ThemeProvider>
  );
}
