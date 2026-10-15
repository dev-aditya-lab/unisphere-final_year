"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { monetag } from "@/lib/monetag";
import { isAdPath } from "@/lib/routes";

/**
 * Loads the Monetag tag once, after the page is idle, and only while the visitor is on one of the pages that are
 * allowed to carry it. Rendered for anonymous visitors only (see app/(marketing)/layout.js). A script cannot be
 * unloaded, so if a visitor then moves to another public page inside the same session it stays loaded there.
 */
export function MonetagTag() {
  const pathname = usePathname();
  const allowed = isAdPath(pathname);

  useEffect(() => {
    if (!monetag.enabled || !allowed || document.querySelector("script[data-unisphere-monetag]")) return;
    const load = () => {
      if (document.querySelector("script[data-unisphere-monetag]")) return;
      const s = document.createElement("script");
      s.src = monetag.tagUrl;
      s.async = true;
      s.dataset.zone = monetag.zone;
      s.dataset.cfasync = "false";
      s.dataset.unisphereMonetag = "true";
      document.head.appendChild(s);
    };
    const useIdle = "requestIdleCallback" in window;
    const handle = useIdle ? window.requestIdleCallback(load, { timeout: 4000 }) : setTimeout(load, 2000);
    return () => (useIdle ? window.cancelIdleCallback(handle) : clearTimeout(handle));
  }, [allowed]);

  return null;
}
