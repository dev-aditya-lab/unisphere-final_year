"use client";

import { useEffect, useState } from "react";

/**
 * Page scroll, reduced to what feed chrome needs:
 *  - `scrolled`  the page has left the top (so a sticky bar can show an edge);
 *  - `hidden`    the member is heading down past the first screen (a phone's bar steps aside) and `false` the moment they head
 *                back up or return to the top;
 *  - `deep`      far enough down that "back to top" is worth offering.
 * One passive listener, throttled to animation frames; it sets state only when one of the three answers changes.
 */
export function useScrollState() {
  const [state, setState] = useState({ scrolled: false, hidden: false, deep: false });
  useEffect(() => {
    let last = window.scrollY;
    let frame = 0;
    const read = () => {
      frame = 0;
      const y = Math.max(0, window.scrollY);
      const dy = y - last;
      const moved = Math.abs(dy) > 10;
      if (moved) last = y;
      const scrolled = y > 8;
      const deep = y > 900;
      setState((prev) => {
        const hidden = y <= 140 ? false : moved ? dy > 0 : prev.hidden;
        return prev.scrolled === scrolled && prev.hidden === hidden && prev.deep === deep ? prev : { scrolled, hidden, deep };
      });
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);
  return state;
}
