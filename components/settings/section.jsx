"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A settings card that can be folded, so a long page is a short list of headings on a phone. Native <details>: the content
 * stays in the page when closed (form values are kept, find-in-page works) and it is keyboard and screen-reader friendly.
 *
 * It opens by itself when the address points at it (`#photo` from the completion checklist) and when `forceOpen` turns true
 * (a field inside has an error), so nothing the member needs to see is ever hidden.
 */
export function SettingsSection({ id, title, description, meta, defaultOpen = false, forceOpen = false, tone, className, children }) {
  const [open, setOpen] = useState(defaultOpen);
  const ref = useRef(null);

  // Adjusting state while rendering (not in an effect): open as soon as `forceOpen` turns true.
  const [seenForce, setSeenForce] = useState(forceOpen);
  if (forceOpen !== seenForce) {
    setSeenForce(forceOpen);
    if (forceOpen) setOpen(true);
  }

  // Open when the address points at this card or at a field inside it (`#photo`, `#bio` from the completion checklist).
  useEffect(() => {
    const openIfTargeted = () => {
      const hash = decodeURIComponent(window.location.hash.slice(1));
      const target = hash ? document.getElementById(hash) : null;
      if (target && ref.current?.contains(target)) {
        setOpen(true);
        requestAnimationFrame(() => target.scrollIntoView({ block: "start" }));
      }
    };
    openIfTargeted();
    window.addEventListener("hashchange", openIfTargeted);
    return () => window.removeEventListener("hashchange", openIfTargeted);
  }, []);

  return (
    <details
      ref={ref}
      id={id}
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className={cn("group surface scroll-mt-24", tone === "danger" && "border-destructive/30", className)}
    >
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3 p-5 select-none sm:p-6 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <h2 className={cn("text-lg font-bold", tone === "danger" && "text-destructive-text")}>{title}</h2>
          {description && <span className="text-muted-foreground mt-0.5 block text-sm">{description}</span>}
        </span>
        <span className="flex shrink-0 items-center gap-2 pt-1">
          {meta && <span className="text-muted-foreground hidden text-xs sm:inline">{meta}</span>}
          <ChevronDown className="text-muted-foreground size-5 transition-transform group-open:rotate-180" aria-hidden="true" />
        </span>
      </summary>
      <div className="space-y-4 px-5 pb-5 sm:px-6 sm:pb-6">{children}</div>
    </details>
  );
}
