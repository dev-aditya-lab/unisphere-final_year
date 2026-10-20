"use client";

import { useEffect, useRef, useState } from "react";
import { animate } from "motion/react";
import { EASE } from "@/lib/motion";

const fmt = (n) => Math.round(n).toLocaleString("en-IN");

/**
 * Shows a number and, when the value changes after the page has loaded, counts to it (at most about 0.9 s, shorter for small
 * changes). The text is written straight into the DOM on each frame, so React does not re-render 60 times a second, and a new
 * value that arrives mid-count continues from what is on screen instead of jumping. The real value is always in the DOM text at
 * rest (a screen reader reads it as plain text, so there is no label that could disagree with it); with reduced motion it simply updates.
 */
export function AnimatedNumber({ value, className }) {
  const node = useRef(null);
  const shown = useRef(value);
  const [first] = useState(() => fmt(value)); // never changes, so React never rewrites the text: only the effect below does

  useEffect(() => {
    const el = node.current;
    if (!el || shown.current === value) return;
    const set = (v) => {
      shown.current = v;
      el.textContent = fmt(v);
    };
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      set(value);
      return;
    }
    const delta = Math.abs(value - shown.current);
    const controls = animate(shown.current, value, {
      duration: Math.min(0.9, 0.35 + delta / 500),
      ease: EASE.out,
      onUpdate: set,
      onComplete: () => set(value),
    });
    return () => controls.stop();
  }, [value]);

  return (
    <span className={className}>
      <span ref={node} className="tabular-nums">{first}</span>
    </span>
  );
}

/** A counter that goes up each time `value` increases after the first render. Use it as `key` or to retrigger a pulse. */
export function useIncrease(value) {
  const [state, setState] = useState({ prev: value, count: 0 });
  if (value !== state.prev) setState({ prev: value, count: state.count + (value > state.prev ? 1 : 0) });
  return state.count;
}
