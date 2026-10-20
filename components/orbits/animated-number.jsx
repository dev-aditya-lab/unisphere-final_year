"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Shows a number and, when the value changes after the page has loaded, counts up to it in about half a second. The real
 * value is always in the accessible label and in the DOM text at rest; with reduced motion it simply updates.
 */
export function AnimatedNumber({ value, className }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (from.current === value) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      from.current = value;
      const t = setTimeout(() => setShown(value), 0);
      return () => clearTimeout(t);
    }
    const start = from.current;
    const began = performance.now();
    let raf;
    const tick = (now) => {
      const t = Math.min(1, (now - began) / 550);
      setShown(Math.round(start + (value - start) * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return (
    <span className={className} aria-label={String(value)}>
      <span aria-hidden="true" className="tabular-nums">{shown.toLocaleString("en-IN")}</span>
    </span>
  );
}
