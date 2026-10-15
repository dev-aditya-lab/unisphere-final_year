"use client";

import { useEffect, useRef } from "react";
import { ads } from "@/lib/ads";
import { loadAdSense } from "@/components/ads/adsense-loader";
import { cn } from "@/lib/utils";

/**
 * One responsive display ad. Renders nothing at all unless AdSense is fully configured and switched on, so there is
 * never a placeholder that looks like an ad.
 *
 * Rules this component keeps (Google's publisher policies):
 *  - labelled "Advertisement", set apart from content by its own bordered band, never styled as a post or a button;
 *  - fixed reserved height, so it cannot shift the page when it fills;
 *  - requested only when it is about to be seen (not for content far below the fold);
 *  - used on public, content-rich pages only: never in the signed-in app, forms, messages or admin screens.
 */
export function AdSlot({ className }) {
  const box = useRef(null);
  const requested = useRef(false);

  useEffect(() => {
    if (!ads.enabled || !box.current) return;
    const node = box.current;
    const request = async () => {
      if (requested.current) return;
      requested.current = true;
      if (!(await loadAdSense())) return;
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch {
        /* the ad script rejected the slot (for example a duplicate request): the reserved space just stays empty */
      }
    };
    if (typeof IntersectionObserver === "undefined") {
      request();
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          request();
        }
      },
      { rootMargin: "300px" },
    );
    io.observe(node);
    return () => io.disconnect();
  }, []);

  if (!ads.enabled) return null;
  return (
    <aside aria-label="Advertisement" className={cn("my-10", className)}>
      <p className="text-muted-foreground mb-1.5 text-center text-[11px] font-semibold tracking-wide uppercase">Advertisement</p>
      <div ref={box} className="bg-muted/40 mx-auto min-h-[280px] w-full max-w-3xl overflow-hidden rounded-lg border">
        <ins
          className="adsbygoogle"
          style={{ display: "block", minHeight: 280 }}
          data-ad-client={ads.clientId}
          data-ad-slot={ads.slotId}
          data-ad-format="auto"
          data-full-width-responsive="true"
        />
      </div>
    </aside>
  );
}
