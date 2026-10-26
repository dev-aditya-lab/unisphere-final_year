"use client";

import { useRef } from "react";
import { m, useAnimationFrame, useInView, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform, useVelocity } from "motion/react";
import { cn } from "@/lib/utils";

const wrap = (min, max, value) => {
  const range = max - min;
  return ((((value - min) % range) + range) % range) + min;
};

function Star({ className }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={cn("size-[0.55em] shrink-0", className)} fill="currentColor">
      <path d="M12 0c.9 5.7 3.9 9.2 12 12-8.1 2.8-11.1 6.3-12 12-.9-5.7-3.9-9.2-12-12 8.1-2.8 11.1-6.3 12-12Z" />
    </svg>
  );
}

/**
 * A strip of large words that drifts sideways on its own and reacts to scrolling: scroll down and it speeds up, scroll up and it
 * reverses, and it leans into the direction of travel (Motion's scroll velocity, a spring to smooth it). It is decoration, so it is
 * hidden from assistive technology. Reduced motion holds it still. That preference is applied inside the frame loop and the
 * transforms, never to the rendered tree: the server cannot know it, and different markup on the client's first render is a
 * hydration mismatch.
 *
 * `speed` is the idle drift in percent of one repeat per second, negative to go left.
 */
export function Marquee({ items, speed = -2.4, className }) {
  const reduce = useReducedMotion();
  // It only moves while it is on screen.
  const ref = useRef(null);
  const onScreen = useInView(ref, { margin: "200px" });
  const baseX = useMotionValue(0);
  const { scrollY } = useScroll();
  const velocity = useVelocity(scrollY);
  const smooth = useSpring(velocity, { damping: 50, stiffness: 400 });
  const boost = useTransform(smooth, [0, 1000], [0, 5], { clamp: false });
  const lean = useTransform(smooth, (v) => (reduce ? 0 : Math.max(-9, Math.min(9, v / -180))));
  const direction = useRef(1);

  useAnimationFrame((_, delta) => {
    if (reduce || !onScreen) return;
    let move = direction.current * speed * (delta / 1000);
    const factor = boost.get();
    if (factor < 0) direction.current = -1;
    else if (factor > 0) direction.current = 1;
    move += direction.current * move * factor;
    baseX.set(baseX.get() + move);
  });

  const x = useTransform(baseX, (value) => `${wrap(-50, 0, value)}%`);
  const sequence = [...items, ...items];

  return (
    <div ref={ref} aria-hidden="true" className={cn("marquee py-5 sm:py-7", className)}>
      <m.div style={{ x, skewX: lean }} className="marquee-track">
        {[0, 1].map((copy) => (
          <div key={copy} className="flex shrink-0 items-center">
            {sequence.map((word, i) => (
              <span key={`${copy}-${word}-${i}`} className="font-display flex items-center gap-[0.5em] pr-[0.5em] text-[clamp(3rem,1.5rem+6vw,7.5rem)] leading-none font-bold tracking-[-0.05em] whitespace-nowrap">
                {word}
                <Star />
              </span>
            ))}
          </div>
        ))}
      </m.div>
    </div>
  );
}
