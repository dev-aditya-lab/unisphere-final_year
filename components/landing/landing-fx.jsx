"use client";

import { useEffect, useRef } from "react";
import { MQ, heroSceneCapabilities, sheryCapabilities } from "@/lib/landing/capabilities";

/**
 * Loads the landing page's scroll choreography and, on desktops, its extra effects. Both are separate chunks that are fetched
 * after the page has hydrated: nothing here is on the critical path, a visitor who prefers reduced motion never downloads either,
 * and the page is complete and visible whether or not they ever load.
 *
 *   lib/landing/scroll-fx.js     GSAP: holds, scrubbed paths, split headlines, reveals
 *   lib/landing/hero-scene.js    three.js: the 3D planet in the hero (a wide, capable screen only; everyone else keeps the still planet)
 *   lib/landing/shery-runtime.js sheryjs + three.js: cursor, magnets, letter labels, hover pictures, WebGL ripple (desktop only)
 *
 * Both return a teardown, so leaving the page (or React re-running the effect) undoes everything they did.
 */
export function LandingFx({ children }) {
  const root = useRef(null);

  useEffect(() => {
    if (!window.matchMedia(MQ.motion).matches) return;
    let cancelled = false;
    let stop = null;
    import("@/lib/landing/scroll-fx")
      .then((fx) => {
        if (!cancelled) stop = fx.startScrollFx(root.current);
      })
      .catch((error) => console.warn("[landing] scroll animation unavailable", error));
    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);

  // The hero's 3D planet. It starts early (it is the first thing seen) but never blocks anything: the still planet is already on screen.
  useEffect(() => {
    if (!heroSceneCapabilities().ok) return undefined;
    const container = root.current?.querySelector("[data-hero-3d]");
    const image = container?.querySelector("[data-hero-planet]");
    if (!container || !image) return undefined;
    let cancelled = false;
    let scene = null;
    const timer = window.setTimeout(async () => {
      try {
        if (!image.complete) {
          await new Promise((resolve) => {
            image.addEventListener("load", resolve, { once: true });
            image.addEventListener("error", resolve, { once: true });
          });
        }
        if (cancelled || !image.naturalWidth) return;
        const { startHeroScene } = await import("@/lib/landing/hero-scene");
        if (cancelled) return;
        // while the loading screen is still up, hold the planet's entrance back until it has lifted
        const delay = document.querySelector("[data-intro-screen]") ? 1.55 : 0.15;
        scene = startHeroScene({
          container,
          image,
          delay,
          onReady: () => container.classList.add("is-3d"),
          // too slow even at the lowest resolution: put the still planet back and free the GPU
          onGiveUp: () => {
            container.classList.remove("is-3d");
            scene?.destroy();
            scene = null;
          },
        });
      } catch (error) {
        console.warn("[landing] the 3D planet is unavailable", error);
      }
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      scene?.destroy();
      container.classList.remove("is-3d");
    };
  }, []);

  // The sheryjs enhancements are a desktop extra: loaded last, once the hero's own entrance has finished (the WebGL picture
  // reads its element's rectangle, which a running transform would distort), and only where the device can spare them.
  useEffect(() => {
    const capabilities = sheryCapabilities();
    if (!capabilities.ok) return;
    let stop = null;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const idle = window.requestIdleCallback ?? ((cb) => window.setTimeout(cb, 1));
      idle(async () => {
        if (cancelled) return;
        try {
          const [{ startShery }, fx] = await Promise.all([import("@/lib/landing/shery-runtime"), import("@/lib/landing/scroll-fx")]);
          if (cancelled) return;
          stop = startShery({ root: root.current, features: { webgl: capabilities.webgl } });
          window.setTimeout(() => fx.refreshScroll(), 300);
        } catch (error) {
          console.warn("[landing] extra effects unavailable", error);
        }
      });
    }, 2200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      stop?.();
    };
  }, []);

  return <div ref={root}>{children}</div>;
}
