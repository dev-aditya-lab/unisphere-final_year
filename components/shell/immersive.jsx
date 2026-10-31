"use client";

import { useEffect } from "react";

/**
 * Marks the page as a full-screen chat screen for as long as it is mounted (see "Chat screens" in globals.css).
 * `mode` is "thread" for an open conversation (a phone hides the top bar and tab bar) or "inbox" for a list of
 * conversations (the bars stay, the page's padding goes). Draws nothing.
 */
export function Immersive({ mode }) {
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.immersive = mode;
    return () => {
      if (root.dataset.immersive === mode) delete root.dataset.immersive;
    };
  }, [mode]);
  return null;
}
