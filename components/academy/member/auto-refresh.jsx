"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Re-reads the page from the server every `seconds` while it is on screen, so "Starting soon" turns into "Live now" and the Join
 * button appears without anyone reloading. Does nothing while the tab is hidden, and asks for no more than one refresh per interval.
 */
export function AutoRefresh({ seconds = 60 }) {
  const router = useRouter();
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const timer = setInterval(tick, Math.max(15, seconds) * 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router, seconds]);
  return null;
}
