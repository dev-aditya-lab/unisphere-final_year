"use client";

import { useLinkStatus } from "next/link";
import { cn } from "@/lib/utils";

/**
 * A small dot that pulses while the link it sits in is navigating. Destinations that cannot be prefetched (see
 * `shouldPrefetch` in lib/nav.js) take a server round trip on click, so this gives the tap an immediate response.
 * Always rendered at a fixed size and only faded in, so it never shifts the layout.
 */
export function NavPending({ className }) {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden="true"
      className={cn(
        "bg-coral size-1.5 shrink-0 rounded-full opacity-0 transition-opacity duration-150",
        pending && "animate-pulse opacity-100",
        className,
      )}
    />
  );
}
