"use client";

import { useRef, useState } from "react";
import { m, useMotionTemplate, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from "motion/react";
import { cn } from "@/lib/utils";

/*
 * Scroll-driven scenes in the style of a product launch page. Each is a tall section with a sticky stage inside; the scroll position
 * drives transform and opacity only (no layout work, no scroll hijacking: the page scrolls normally). For people who prefer reduced
 * motion every scene collapses into ordinary stacked content.
 */

/** The hero: a headline that fades away as a large picture rises, tilts flat and scales up to fill the frame. */
export function HeroStage({ children, src, alt = "" }) {
  const ref = useRef(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const textOpacity = useTransform(scrollYProgress, [0, 0.3], [1, 0]);
  const textY = useTransform(scrollYProgress, [0, 0.3], [0, -90]);
  const textScale = useTransform(scrollYProgress, [0, 0.3], [1, 0.94]);
  const scale = useTransform(scrollYProgress, [0.02, 0.68], [0.6, 1]);
  const rotateX = useTransform(scrollYProgress, [0.02, 0.68], [28, 0]);
  const y = useTransform(scrollYProgress, [0, 0.68], [440, 0]);
  return (
    <section ref={ref} className={cn("ac-band", !reduce && "h-[230vh]")}>
      <div className={cn(!reduce && "sticky top-0 h-dvh overflow-hidden")}>
        <m.div style={reduce ? undefined : { opacity: textOpacity, y: textY, scale: textScale }} className="mx-auto flex max-w-5xl flex-col items-center px-4 pt-28 text-center sm:pt-32">
          {children}
        </m.div>
        <div className={cn("relative mx-auto mt-10 max-w-5xl px-4", !reduce && "absolute inset-x-0 bottom-0 mt-0")} style={{ perspective: 1400 }}>
          <m.div style={reduce ? undefined : { scale, rotateX, y, transformOrigin: "50% 100%" }} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={alt} width={1600} height={1000} fetchPriority="high" decoding="async" className="h-auto w-full" />
          </m.div>
        </div>
      </div>
    </section>
  );
}

/**
 * The opening scene. A small rounded window sits under the headline; as the page scrolls it opens until it fills the whole screen,
 * the picture inside slowly pulls back, the headline lifts away and a closing line appears over the picture. Clip-path, transform
 * and opacity only. For reduced motion it is a plain headline above a framed picture.
 */
export function WindowHero({ children, src, alt = "", caption }) {
  const ref = useRef(null);
  const reduce = useReducedMotion();
  const { scrollYProgress: p } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const top = useTransform(p, [0, 0.7], [67, 0]);
  const side = useTransform(p, [0, 0.7], [17, 0]);
  const bottom = useTransform(p, [0, 0.7], [4, 0]);
  const radius = useTransform(p, [0, 0.7], [28, 0]);
  const clip = useMotionTemplate`inset(${top}% ${side}% ${bottom}% ${side}% round ${radius}px)`;
  const zoom = useTransform(p, [0, 0.8], [1.35, 1]);
  const textY = useTransform(p, [0, 0.45], [0, -140]);
  const textOpacity = useTransform(p, [0, 0.4], [1, 0]);
  const capOpacity = useTransform(p, [0.72, 0.92], [0, 1]);
  const capY = useTransform(p, [0.72, 0.92], [30, 0]);

  if (reduce) {
    return (
      <section className="mx-auto max-w-5xl px-4 py-16 text-center">
        {children}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} width={1600} height={1000} className="mt-10 h-auto w-full rounded-3xl" />
      </section>
    );
  }
  return (
    <section ref={ref} className="relative h-[260vh]">
      <div className="sticky top-0 h-dvh overflow-hidden">
        <m.div style={{ y: textY, opacity: textOpacity }} className="mx-auto flex max-w-5xl flex-col items-center px-4 pt-20 text-center sm:pt-24">
          {children}
        </m.div>
        <m.div style={{ clipPath: clip }} className="absolute inset-0 bg-[#e8edf6]">
          <m.div style={{ scale: zoom }} className="grid size-full place-items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={alt} width={1600} height={1000} fetchPriority="high" decoding="async" className="h-full w-full object-cover" />
          </m.div>
          <m.p style={{ opacity: capOpacity, y: capY }} className="ac-display absolute inset-x-0 top-[5%] px-6 text-center text-[clamp(1.2rem,2.6vw,2.2rem)] text-[#0b0f19]">{caption}</m.p>
        </m.div>
      </div>
    </section>
  );
}

function Word({ progress, range, children }) {
  const opacity = useTransform(progress, range, [0.18, 1]);
  return <m.span style={{ opacity }} className="inline-block">{children}&nbsp;</m.span>;
}

/** A statement whose words light up one by one as the page scrolls. */
export function ScrollWords({ text, className }) {
  const ref = useRef(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.85", "end 0.4"] });
  const words = text.split(" ");
  if (reduce) return <p className={className}>{text}</p>;
  return (
    <p ref={ref} className={className} aria-label={text}>
      <span aria-hidden>
        {words.map((w, i) => (
          <Word key={`${w}-${i}`} progress={scrollYProgress} range={[i / words.length, Math.min(1, (i + 1.6) / words.length)]}>{w}</Word>
        ))}
      </span>
    </p>
  );
}

/** Steps on the left change as the page scrolls; the picture on the right changes with them. The section stays pinned meanwhile. */
export function PinnedStory({ steps }) {
  const ref = useRef(null);
  const reduce = useReducedMotion();
  const [active, setActive] = useState(0);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  useMotionValueEvent(scrollYProgress, "change", (v) => setActive(Math.max(0, Math.min(steps.length - 1, Math.floor(v * steps.length * 0.999)))));
  const bar = useTransform(scrollYProgress, [0, 1], ["0%", "100%"]);

  if (reduce) {
    return (
      <div className="mx-auto max-w-5xl space-y-16 px-4 py-16">
        {steps.map((s) => (
          <div key={s.title} className="grid items-center gap-8 md:grid-cols-2">
            <div><h3 className="ac-display text-4xl">{s.title}</h3><p className="text-muted-foreground mt-4 text-lg">{s.text}</p></div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={s.src} alt="" width={1200} height={900} loading="lazy" className="h-auto w-full rounded-3xl" />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div ref={ref} style={{ height: `${steps.length * 90}vh` }} className="relative">
      <div className="sticky top-0 flex h-dvh items-center">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 sm:px-6 md:grid-cols-[1fr_1.15fr]">
          <div>
            <ol className="space-y-7">
              {steps.map((s, i) => (
                <li key={s.title} className="transition-opacity duration-500" style={{ opacity: i === active ? 1 : 0.28 }} aria-current={i === active ? "step" : undefined}>
                  <p className="ac-kicker">0{i + 1}</p>
                  <h3 className="ac-display mt-2 text-[clamp(1.8rem,4vw,3.2rem)]">{s.title}</h3>
                  <div className="grid transition-[grid-template-rows] duration-500" style={{ gridTemplateRows: i === active ? "1fr" : "0fr" }}>
                    <p className="text-muted-foreground overflow-hidden text-lg">{s.text}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="bg-border mt-8 h-0.5 w-40 overflow-hidden rounded-full"><m.div className="h-full bg-foreground" style={{ width: bar }} /></div>
          </div>
          <div className="relative aspect-[4/3] w-full">
            {steps.map((s, i) => (
              <m.div key={s.src} aria-hidden={i !== active} initial={false} animate={{ opacity: i === active ? 1 : 0, scale: i === active ? 1 : 0.94, y: i === active ? 0 : 24 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }} className="absolute inset-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.src} alt={i === active ? s.alt : ""} width={1200} height={900} loading="lazy" decoding="async" className="size-full rounded-3xl object-cover shadow-2xl shadow-black/30" />
              </m.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** A row of tall cards that slides sideways while the page scrolls down. */
export function HorizontalShowcase({ items }) {
  const ref = useRef(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const x = useTransform(scrollYProgress, [0.05, 0.95], ["0%", `-${Math.max(0, items.length - 1) * 17}%`]);
  const card = (it) => (
    <article key={it.title} className="ac-ink-card relative w-[78vw] shrink-0 overflow-hidden sm:w-[26rem]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={it.src} alt="" width={800} height={1000} loading="lazy" decoding="async" className="aspect-[4/5] w-full object-cover" />
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/55 to-transparent p-6 pt-24">
        <h3 className="ac-display text-2xl text-white">{it.title}</h3>
        <p className="mt-2 text-sm text-[#c8c8cf]">{it.text}</p>
      </div>
    </article>
  );
  if (reduce) return <div className="flex gap-5 overflow-x-auto px-4 pb-4">{items.map(card)}</div>;
  return (
    <div ref={ref} className="relative h-[320vh]">
      <div className="sticky top-0 flex h-dvh items-center overflow-hidden">
        <m.div style={{ x }} className="flex gap-6 pl-[max(1rem,calc((100vw-72rem)/2))] will-change-transform">{items.map(card)}</m.div>
      </div>
    </div>
  );
}

/** A big outlined word that drifts sideways as the page scrolls. */
export function ParallaxWord({ children }) {
  const ref = useRef(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const x = useTransform(scrollYProgress, [0, 1], ["12%", "-30%"]);
  return (
    <div ref={ref} aria-hidden className="overflow-hidden py-4">
      <m.div style={reduce ? undefined : { x }} className="ac-display ac-grad text-[clamp(5rem,16vw,14rem)] leading-none whitespace-nowrap">{children}</m.div>
    </div>
  );
}
