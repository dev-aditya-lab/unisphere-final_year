import Lenis from "lenis";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

/**
 * Momentum scrolling for the landing page (Lenis), driven by GSAP's own ticker so every scroll-linked animation reads the same
 * smoothed position on the same frame (no lag between the page and a pinned or scrubbed element).
 *
 * It smooths a mouse wheel and a trackpad only; a touch screen keeps its native momentum scrolling, which is already smooth.
 * Not started at all for reduced motion (landing-fx.jsx does not load this module then).
 *
 * Returns `destroy()`, which puts the page back exactly as it found it.
 */
export function startSmoothScroll() {
  const lenis = new Lenis({
    lerp: 0.09,
    smoothWheel: true,
    syncTouch: false,
    autoRaf: false,
    // Scrolling inside a dialog, menu, list or text box is the browser's own business.
    prevent: (node) => !!node.closest?.('[data-lenis-prevent], [role="dialog"], [role="listbox"], [role="menu"], textarea'),
  });

  lenis.on("scroll", ScrollTrigger.update);
  const tick = (time) => lenis.raf(time * 1000);
  gsap.ticker.add(tick);
  gsap.ticker.lagSmoothing(0);

  // A link to a section of this same page (the header's "How it works", a footer link) glides there instead of jumping.
  const onClick = (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest?.("a[href]");
    if (!link || (link.target && link.target !== "_self")) return;
    const url = new URL(link.href, window.location.href);
    if (url.origin !== window.location.origin || url.pathname !== window.location.pathname || url.hash.length < 2) return;
    const target = document.getElementById(decodeURIComponent(url.hash.slice(1)));
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    lenis.scrollTo(target, { offset: -8, duration: 1.5 });
  };
  document.addEventListener("click", onClick, true);

  // While a dialog or the mobile menu has locked the page, nothing behind it should scroll.
  const syncLock = () => (document.body.hasAttribute("data-scroll-locked") ? lenis.stop() : lenis.start());
  const observer = new MutationObserver(syncLock);
  observer.observe(document.body, { attributes: true, attributeFilter: ["data-scroll-locked"] });
  syncLock();

  return {
    lenis,
    destroy() {
      document.removeEventListener("click", onClick, true);
      observer.disconnect();
      gsap.ticker.remove(tick);
      gsap.ticker.lagSmoothing(500, 33);
      lenis.destroy();
    },
  };
}
