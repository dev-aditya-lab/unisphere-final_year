"use client";

import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { PwaProvider } from "@/components/pwa/pwa-provider";
import { NativeBridge } from "@/components/native/native-bridge";
import { RouteProgress } from "@/components/shell/route-progress";

export function Providers({ children }) {
  return (
    <ThemeProvider>
      {/* The animation engine and its reduced-motion setting live in <MotionFeatures>
          (components/motion/motion-features.jsx), so pages that do not animate with it never download it. */}
      <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
      <PwaProvider />
      <NativeBridge />
      <RouteProgress />
      <Toaster />
    </ThemeProvider>
  );
}
