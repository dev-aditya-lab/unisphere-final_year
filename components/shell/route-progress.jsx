"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * Answers a tap on any internal link within one frame. Next.js shows the destination's skeleton only after the server
 * has replied (unless the link was prefetched), so on a slow phone or network the screen can sit unchanged for a second
 * or more after a tap. This shows a thin bar at the top from the moment of the tap until the path changes.
 *
 * It only listens; it never prevents or delays the navigation. Same-page links, hash links, new-tab clicks,
 * modified clicks and downloads are ignored, and the bar gives up after 10 s so it can never stay stuck.
 */
export function RouteProgress() {
  const pathname = usePathname();
  // `tapped` is true from a tap until the path changes. When the path changes the state is reset during render (the
  // documented way to reset state when a value changes), so a stale bar can never reappear on a later visit.
  const [state, setState] = useState({ tapped: false, seen: pathname });
  if (state.seen !== pathname) setState({ tapped: false, seen: pathname });
  const tapped = state.tapped && state.seen === pathname;

  useEffect(() => {
    function onClick(event) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!link || (link.target && link.target !== "_self") || link.hasAttribute("download")) return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      setState((s) => ({ ...s, tapped: true }));
    }
    // Capture phase, so a handler that stops propagation cannot hide the tap from us.
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  useEffect(() => {
    if (!tapped) return;
    const timer = setTimeout(() => setState((s) => ({ ...s, tapped: false })), 10_000);
    return () => clearTimeout(timer);
  }, [tapped]);

  return tapped ? <div className="route-progress" aria-hidden="true" /> : null;
}
