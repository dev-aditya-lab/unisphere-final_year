import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";
import { MotionPathPlugin } from "gsap/MotionPathPlugin";
import { MQ } from "@/lib/landing/capabilities";
import { startSmoothScroll } from "@/lib/landing/smooth-scroll";

gsap.registerPlugin(ScrollTrigger, SplitText, DrawSVGPlugin, MotionPathPlugin);
// Do not call ScrollTrigger.config() here. Called without `syncInterval` it overwrites the stored id of ScrollTrigger's 250 ms sync timer
// with undefined, so disable() (below) can never stop that timer. Touch-only devices already ignore the address-bar resize by default.
// Once registered, ScrollTrigger keeps a per-frame callback, a 250 ms timer and a few global listeners running for as long as the page
// lives, even with no triggers left. This page is one route of a client-routed app, so it switches that engine off when it is torn
// down (and back on if the landing page is visited again) instead of leaving it running under the signed-in app.
let engineOn = true;

/**
 * Scroll choreography for the landing page (GSAP, with Lenis for the momentum).
 *
 * This module is fetched by components/landing/landing-fx.jsx after the page has hydrated, and only for visitors who have not
 * asked for reduced motion, so the page's critical path and a reduced-motion visitor's download never include it. The sections are
 * server-rendered, complete and fully visible with no script; this finds the parts marked with data attributes and animates them.
 * Nothing is hidden until this runs, so a failed script or a crawler still gets the whole page, and the two "hold" sections only
 * pin on large screens (below that they are ordinary stacked content).
 *
 *   data-hero-line                           the hero's lines slide apart, in opposite directions, as it scrolls away
 *   data-statement                           words fill in as you read; <mark> underlines sweep in after them
 *   data-hscroll                             "How it works": the page holds while three panels scroll sideways, a path draws and a dot rides it
 *   data-pin-story                           a framed picture opens to the full screen while the headline rises out of it
 *   data-reveal="up|left|right|scale|fade"   fade a block in as it enters (data-delay for a pause)
 *   data-stagger                             fade its children in one after another
 *   data-split                               headline: lines rise out of a mask
 *   data-lag="60"                            a column that drifts against the scroll (pixels), so neighbours move at different speeds
 *   data-img-reveal / data-img-inner         picture: wiped open, settling from a slight zoom
 *   data-parallax="8"                        picture drifts against the scroll (percent of its own height)
 *   data-draw="once|scrub"  data-path        SVG: strokes draw themselves (once, or scrubbed with the scroll); data-pop elements pop in
 *   data-travel="#path-id"                   an SVG dot that rides a path while it is on screen
 *   data-giant                               the footer's giant wordmark rises into view
 *
 * Motion (the library) handles the interface that has state: the tabs, the marquee, the badge, pointer parallax, counters, tilt.
 */

const FROM = { up: { y: 48 }, down: { y: -48 }, left: { x: -72 }, right: { x: 72 }, scale: { scale: 0.92 }, fade: {} };
const ease = "power3.out";

/** The header slips away while you read down the page and comes back on the first scroll up (or when it takes focus). */
function headerBehaviour() {
  const header = document.querySelector(".mkt-header");
  if (!header) return undefined;
  const show = () => {
    header.dataset.hidden = "false";
  };
  header.addEventListener("focusin", show);
  const mark = (scroll) => {
    const top = scroll < 60;
    if (header.dataset.top !== String(top)) header.dataset.top = String(top);
  };
  mark(window.scrollY);
  const trigger = ScrollTrigger.create({
    start: 0,
    end: "max",
    onUpdate: (self) => {
      const hide = self.direction === 1 && self.scroll() > 320;
      if (header.dataset.hidden !== String(hide)) header.dataset.hidden = String(hide);
      mark(self.scroll());
    },
  });
  return () => {
    trigger.kill();
    header.removeEventListener("focusin", show);
    delete header.dataset.hidden;
    delete header.dataset.top;
  };
}

/** The hero's three lines slide sideways in alternating directions while the hero scrolls out of view. */
function heroLines(root) {
  gsap.utils.toArray("[data-hero-line]", root).forEach((line, i) => {
    gsap.to(line, {
      xPercent: i % 2 ? 9 : -9,
      ease: "none",
      scrollTrigger: { trigger: line.closest("section"), start: "top top", end: "bottom top", scrub: true },
    });
  });
}

/** One big sentence that fills in word by word as it is read, then underlines its key phrases. */
function statements(root) {
  gsap.utils.toArray("[data-statement]", root).forEach((paragraph) => {
    // aria "none": the words stay ordinary text, so nothing about how it is read out changes.
    const split = SplitText.create(paragraph, { type: "words", wordsClass: "word", aria: "none" });
    gsap.fromTo(
      split.words,
      { "--p": 0 },
      { "--p": 1, ease: "none", duration: 1, stagger: { each: 0.1 }, scrollTrigger: { trigger: paragraph, start: "top 84%", end: "bottom 46%", scrub: true } },
    );
    const marks = gsap.utils.toArray("mark", paragraph);
    if (marks.length) {
      gsap.fromTo(
        marks,
        { "--mark": 0 },
        { "--mark": 1, ease: "power2.out", duration: 1, stagger: { each: 0.9 }, scrollTrigger: { trigger: paragraph, start: "top 52%", end: "bottom 38%", scrub: true } },
      );
    }
  });
}

/** "How it works": the page holds, three panels slide sideways, a path draws under them and a dot rides it. */
function holdHorizontal(root) {
  const section = root.querySelector("[data-hscroll]");
  const track = section?.querySelector("[data-hscroll-track]");
  const panels = gsap.utils.toArray("[data-panel]", section ?? root);
  if (!section || !track || panels.length < 2) return undefined;
  section.classList.add("is-pinned");

  const distance = () => Math.max(0, track.scrollWidth - window.innerWidth);
  const range = { trigger: section, start: "top top", end: () => `+=${distance()}`, invalidateOnRefresh: true };
  const slide = gsap.to(track, {
    x: () => -distance(),
    ease: "none",
    scrollTrigger: { ...range, pin: true, scrub: 1, anticipatePin: 1, refreshPriority: 2 },
  });

  const line = section.querySelector("[data-hscroll-line]");
  const dot = section.querySelector("[data-hscroll-dot]");
  const bar = section.querySelector("[data-hscroll-bar]");
  if (line) gsap.fromTo(line, { drawSVG: "0%" }, { drawSVG: "100%", ease: "none", scrollTrigger: { ...range, scrub: true } });
  if (line && dot) gsap.to(dot, { motionPath: { path: line, align: line, alignOrigin: [0.5, 0.5] }, ease: "none", immediateRender: true, scrollTrigger: { ...range, scrub: true } });
  if (bar) gsap.to(bar, { scaleX: 1, ease: "none", scrollTrigger: { ...range, scrub: true } });

  // Each panel after the first builds as it slides into view: its drawing strokes in and its words arrive from the right.
  panels.forEach((panel, i) => {
    if (i === 0) return;
    const art = gsap.utils.toArray("[data-art-path]", panel);
    const words = panel.querySelectorAll(".step-text > *");
    const when = { trigger: panel, containerAnimation: slide, start: "left 88%", end: "left 38%", scrub: true };
    if (art.length) gsap.fromTo(art, { drawSVG: "0%" }, { drawSVG: "100%", ease: "none", stagger: 0.08, scrollTrigger: when });
    gsap.fromTo(words, { opacity: 0, x: 90 }, { opacity: 1, x: 0, ease: "none", stagger: 0.12, scrollTrigger: when });
  });

  return () => section.classList.remove("is-pinned");
}

function holdStory(root) {
  const section = root.querySelector("[data-pin-story]");
  const frame = section?.querySelector("[data-story-frame]");
  if (!section || !frame) return undefined;
  const image = section.querySelector("[data-story-img]");
  const scrim = section.querySelector(".story-scrim");
  section.classList.add("is-pinned");

  const lines = gsap.utils.toArray("[data-story-line] > span", section);
  const rest = gsap.utils.toArray("[data-story-fade]", section);
  gsap.set(lines, { yPercent: 118 });
  gsap.set(rest, { opacity: 0, y: 24 });
  gsap.set(frame, { clipPath: "inset(14% 22% 14% 22% round 32px)" });
  if (scrim) gsap.set(scrim, { opacity: 0 });

  const timeline = gsap.timeline({
    defaults: { ease: "none" },
    scrollTrigger: { trigger: section, start: "top top", end: "+=170%", pin: true, scrub: 0.8, anticipatePin: 1, refreshPriority: 1, invalidateOnRefresh: true },
  });
  // The picture opens from a framed card to the whole screen while it settles from a zoom; then the headline rises out of it.
  timeline.to(frame, { clipPath: "inset(0% 0% 0% 0% round 0px)", duration: 1, ease: "power2.inOut" }, 0);
  if (image) timeline.fromTo(image, { scale: 1.3 }, { scale: 1, duration: 1.5 }, 0);
  if (scrim) timeline.to(scrim, { opacity: 0.6, duration: 0.5 }, 0.55);
  timeline.to(lines, { yPercent: 0, duration: 0.5, stagger: 0.14, ease: "power3.out" }, 0.85);
  timeline.to(rest, { opacity: 1, y: 0, duration: 0.45, stagger: 0.12, ease: "power2.out" }, 1.25);
  timeline.to({}, { duration: 0.45 });

  return () => section.classList.remove("is-pinned");
}

function reveals(root) {
  gsap.utils.toArray("[data-reveal]", root).forEach((el) => {
    if (el.closest(".is-pinned")) return;
    gsap.from(el, {
      opacity: 0,
      ...(FROM[el.dataset.reveal] ?? FROM.up),
      duration: 1.2,
      ease,
      delay: Number(el.dataset.delay) || 0,
      scrollTrigger: { trigger: el, start: "top 88%", once: true },
    });
  });
  gsap.utils.toArray("[data-stagger]", root).forEach((group) => {
    if (group.closest(".is-pinned")) return;
    gsap.from(group.children, {
      opacity: 0,
      y: 40,
      duration: 1,
      ease,
      stagger: 0.1,
      scrollTrigger: { trigger: group, start: "top 86%", once: true },
    });
  });
}

function splitHeadlines(root) {
  gsap.utils.toArray("[data-split]", root).forEach((el) => {
    SplitText.create(el, {
      type: "lines",
      mask: "lines",
      autoSplit: true,
      onSplit: (self) => {
        // The masks hug each line box, and a tight line-height would shave the descenders (y, g, p) off; give them room below.
        gsap.set(self.masks, { paddingBottom: "0.22em", marginBottom: "-0.22em" });
        return gsap.from(self.lines, {
          yPercent: 112,
          rotate: 3,
          duration: 1.2,
          ease: "power4.out",
          stagger: 0.1,
          scrollTrigger: { trigger: el, start: "top 86%", once: true },
        });
      },
    });
  });
}

/** Columns that drift against the scroll by different amounts, so neighbours move at different speeds. */
function lagged(root) {
  gsap.utils.toArray("[data-lag]", root).forEach((el) => {
    const amount = Number(el.dataset.lag) || 40;
    gsap.fromTo(el, { y: amount }, { y: -amount, ease: "none", scrollTrigger: { trigger: el, start: "top bottom", end: "bottom top", scrub: true } });
  });
}

function pictures(root) {
  gsap.utils.toArray("[data-img-reveal]", root).forEach((frame) => {
    const inner = frame.querySelector("[data-img-inner]");
    const timeline = gsap.timeline({ scrollTrigger: { trigger: frame, start: "top 88%", once: true } });
    timeline.fromTo(frame, { clipPath: "inset(0 0 100% 0 round 32px)" }, { clipPath: "inset(0 0 0% 0 round 32px)", duration: 1.3, ease: "power3.inOut", onComplete: () => gsap.set(frame, { clearProps: "clipPath" }) }, 0);
    if (inner) timeline.fromTo(inner, { scale: 1.3 }, { scale: 1, duration: 1.7, ease: "power3.out" }, 0);
  });
  gsap.utils.toArray("[data-parallax]", root).forEach((el) => {
    const amount = Number(el.dataset.parallax) || 8;
    gsap.fromTo(el, { yPercent: -amount }, { yPercent: amount, ease: "none", scrollTrigger: { trigger: el.parentElement, start: "top bottom", end: "bottom top", scrub: true } });
  });
}

function strokes(root) {
  gsap.utils.toArray("[data-draw]", root).forEach((svg) => {
    if (svg.closest(".is-pinned")) return;
    const scrub = svg.dataset.draw === "scrub";
    const paths = svg.querySelectorAll("[data-path]");
    if (paths.length) {
      gsap.fromTo(
        paths,
        { drawSVG: "0%" },
        {
          drawSVG: "100%",
          ease: scrub ? "none" : "power2.inOut",
          duration: scrub ? 1 : 1.6,
          stagger: scrub ? 0.15 : 0.12,
          scrollTrigger: scrub ? { trigger: svg, start: "top 80%", end: "bottom 50%", scrub: 0.8 } : { trigger: svg, start: "top 82%", once: true },
        },
      );
    }
    const pops = svg.querySelectorAll("[data-pop]");
    if (pops.length) {
      gsap.from(pops, { opacity: 0, scale: 0.4, transformOrigin: "50% 50%", duration: 0.8, ease: "back.out(1.7)", stagger: 0.09, scrollTrigger: { trigger: svg, start: "top 78%", once: true } });
    }
  });
}

function travellers(root) {
  gsap.utils.toArray("[data-travel]", root).forEach((dot) => {
    const svg = dot.ownerSVGElement;
    const path = svg?.querySelector(dot.dataset.travel);
    if (!svg || !path) return;
    gsap.to(dot, {
      motionPath: { path, align: path, alignOrigin: [0.5, 0.5] },
      duration: Number(dot.dataset.duration) || 6,
      delay: Number(dot.dataset.delay) || 0,
      repeat: -1,
      ease: "none",
      scrollTrigger: { trigger: svg, start: "top bottom", end: "bottom top", toggleActions: "play pause resume pause" },
    });
  });
}

/** The Refer & Earn stage: its drifting colour slides against the scroll, so the glow seems to move through the section. */
function referStage(root) {
  gsap.utils.toArray("[data-refer-stage]", root).forEach((stage) => {
    gsap.fromTo(stage, { "--shift": "-14%" }, { "--shift": "14%", ease: "none", scrollTrigger: { trigger: stage, start: "top bottom", end: "bottom top", scrub: true } });
  });
  return () => gsap.utils.toArray("[data-refer-stage]", root).forEach((stage) => stage.style.removeProperty("--shift"));
}

/** Sections marked data-pause-offscreen get data-live="true|false" as they enter and leave the viewport; landing.css pauses their CSS loops while it is false. */
function pauseOffscreen(root) {
  const nodes = gsap.utils.toArray("[data-pause-offscreen]", root);
  if (!nodes.length || !("IntersectionObserver" in window)) return undefined;
  const observer = new IntersectionObserver(
    (entries) => entries.forEach((entry) => (entry.target.dataset.live = entry.isIntersecting ? "true" : "false")),
    { rootMargin: "200px 0px" },
  );
  nodes.forEach((node) => observer.observe(node));
  return () => {
    observer.disconnect();
    nodes.forEach((node) => delete node.dataset.live);
  };
}

/** The footer's giant wordmark rises out of its mask as the page reaches the end. */
function giantWord() {
  const word = document.querySelector("[data-giant]");
  if (!word) return undefined;
  gsap.fromTo(word, { "--rise": "100%" }, { "--rise": "0%", duration: 1.6, ease: "power4.out", scrollTrigger: { trigger: word, start: "top 96%", once: true } });
  return () => word.style.removeProperty("--rise");
}

/** Starts every animation under `root`; returns the function that undoes all of it (including pinning and smooth scrolling). */
export function startScrollFx(root) {
  if (!engineOn) {
    ScrollTrigger.enable();
    engineOn = true;
  }
  const smooth = startSmoothScroll();
  const mm = gsap.matchMedia();
  let failed = false;
  // Animation must never take the page down. If any part of the set-up throws, everything it created is reverted (every
  // element goes back to its normal, visible, unpinned state) and the page simply stays static.
  const attempt = (name, run) => {
    if (failed) return undefined;
    try {
      return run();
    } catch (error) {
      failed = true;
      console.warn(`[landing] the ${name} animation is unavailable, showing the static page`, error);
      root.querySelectorAll(".is-pinned").forEach((el) => el.classList.remove("is-pinned"));
      mm.revert();
      return undefined;
    }
  };

  // The holds go first, in page order, so every trigger created after them measures the final layout.
  mm.add(MQ.pins, () => {
    const undo = [attempt("hold", () => holdHorizontal(root)), attempt("story", () => holdStory(root))];
    return () => undo.forEach((fn) => fn?.());
  });
  mm.add(MQ.motion, () => {
    const undo = [
      attempt("hero", () => heroLines(root)),
      attempt("statement", () => statements(root)),
      attempt("reveal", () => reveals(root)),
      attempt("headline", () => splitHeadlines(root)),
      attempt("column", () => lagged(root)),
      attempt("picture", () => pictures(root)),
      attempt("path", () => strokes(root)),
      attempt("travelling dot", () => travellers(root)),
      attempt("refer stage", () => referStage(root)),
      attempt("off-screen pause", () => pauseOffscreen(root)),
      attempt("wordmark", () => giantWord()),
      attempt("header", () => headerBehaviour()),
    ];
    return () => undo.forEach((fn) => fn?.());
  });

  // Late fonts move every line break; measure again once they are in.
  let alive = true;
  document.fonts?.ready?.then(() => {
    if (alive) ScrollTrigger.refresh();
  });

  return () => {
    alive = false;
    mm.revert();
    smooth.destroy();
    ScrollTrigger.disable(false, true);
    engineOn = false;
  };
}

export function refreshScroll() {
  if (engineOn) ScrollTrigger.refresh();
}
