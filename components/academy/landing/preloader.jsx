"use client";

import { useEffect, useState } from "react";
import { AcademyMark } from "@/components/academy/brand/academy-logo";

const KEY = "academy-intro-seen";

/**
 * The loading scene: a black curtain, the Academy mark drawing itself and a counter, lifted when the page has loaded (never later
 * than about two seconds). Shown once per browser tab session, skipped for people who prefer reduced motion, and a CSS timer lifts it
 * even if scripts fail, so it can never trap anyone behind it.
 */
export function Preloader() {
  const [state, setState] = useState("show"); // show -> lifting -> gone
  const [n, setN] = useState(0);

  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem(KEY) === "1";
    } catch {
      /* storage blocked: show it, it is short */
    }
    if (seen || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const t = setTimeout(() => setState("gone"), 0);
      return () => clearTimeout(t);
    }
    const started = performance.now();
    const MIN = 1100;
    const MAX = 2000;
    let raf;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      try {
        sessionStorage.setItem(KEY, "1");
      } catch {
        /* ignore */
      }
      setN(100);
      setState("lifting");
      setTimeout(() => setState("gone"), 900);
    };
    const tick = () => {
      const t = performance.now() - started;
      setN(Math.min(99, Math.floor((t / MAX) * 100)));
      if (!finished) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const ready = () => setTimeout(finish, Math.max(0, MIN - (performance.now() - started)));
    if (document.readyState === "complete") ready();
    else window.addEventListener("load", ready, { once: true });
    const cap = setTimeout(finish, MAX);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(cap);
      window.removeEventListener("load", ready);
    };
  }, []);

  if (state === "gone") return null;
  return (
    <div className="ac-preloader" data-done={state === "lifting"} aria-hidden="true" style={{ animation: state === "show" ? "ac-curtain 800ms cubic-bezier(0.76,0,0.24,1) 2.6s forwards" : undefined }}>
      <noscript><style>{".ac-preloader{display:none!important}"}</style></noscript>
      <div className="flex flex-col items-center gap-6">
        <AcademyMark className="size-20" tile />
        <p className="font-mono text-sm tracking-[0.3em] text-white/60 tabular-nums">{String(n).padStart(3, "0")}</p>
      </div>
    </div>
  );
}
