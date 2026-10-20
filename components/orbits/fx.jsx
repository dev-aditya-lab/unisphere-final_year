"use client";

import { useEffect, useRef } from "react";
import { useInView, useReducedMotion } from "motion/react";
import { RewardIcon } from "@/components/orbits/reward-icon";
import { fireConfetti } from "@/components/motion/confetti";
import { cn } from "@/lib/utils";

/**
 * Orbits visual effects: one small set of reusable, purely decorative pieces.
 *
 *  - Ambient motion is CSS or SVG (transform and opacity only) and is paused while the element is off screen.
 *  - Everything decorative is aria-hidden and pointer-events-none, so it never gets in the way of a click, the keyboard or a
 *    screen reader.
 *  - Nothing here knows about rewards. An effect plays because a parent decided a server-confirmed thing happened.
 */

export const ORBIT_CONFETTI = ["#6366f1", "#8b5cf6", "#a78bfa", "#f5b82e", "#14b8a6", "#f2603c", "#60a5fa"];

/** Marks an element (and its CSS animations) paused while it is scrolled out of view. */
export function usePauseOffscreen() {
  const ref = useRef(null);
  const inView = useInView(ref, { margin: "120px" });
  return { ref, paused: !inView, props: { "data-orbit-paused": String(!inView) } };
}

/** Burst of confetti from the centre of an element (or the middle of the screen). Does nothing for reduced motion. */
export function burstFrom(el, opts = {}) {
  if (typeof window === "undefined") return;
  const r = el?.getBoundingClientRect?.();
  const x = r ? (r.left + r.width / 2) / window.innerWidth : 0.5;
  const y = r ? (r.top + r.height / 2) / window.innerHeight : 0.4;
  fireConfetti({ x, y, count: 54, spread: 0.8, colors: ORBIT_CONFETTI, ...opts });
}

/**
 * Sets --px/--py (-1..1) on the element from the pointer, for the `orbit-depth` layers. Fine pointers only, never for reduced
 * motion, one write per animation frame, and it resets when the pointer leaves.
 */
export function usePointerDepth() {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !window.matchMedia?.("(hover: hover) and (pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const move = (e) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        el.style.setProperty("--px", (((e.clientX - r.left) / r.width) * 2 - 1).toFixed(3));
        el.style.setProperty("--py", (((e.clientY - r.top) / r.height) * 2 - 1).toFixed(3));
      });
    };
    const leave = () => {
      cancelAnimationFrame(raf);
      el.style.setProperty("--px", "0");
      el.style.setProperty("--py", "0");
    };
    el.addEventListener("pointermove", move, { passive: true });
    el.addEventListener("pointerleave", leave);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
    };
  }, []);
  return ref;
}

const MIN_ANIMATED_SIZE = 100;
const RING = { rx: 46, ry: 15, tilt: -24 };
const BACK_PATH = `M${50 - RING.rx} 50 A${RING.rx} ${RING.ry} 0 0 0 ${50 + RING.rx} 50 A${RING.rx} ${RING.ry} 0 0 0 ${50 - RING.rx} 50`;
const FRONT_ARC = `M${50 - RING.rx} 50 A${RING.rx} ${RING.ry} 0 0 0 ${50 + RING.rx} 50`;

function RingLayer({ front, animate, dots }) {
  // The path starts at the left tip and runs along the lower (near) half first, then the upper (far) half. A dot is visible in the
  // front layer for the first half of the loop and in the back layer for the second, so it passes in front of and behind the planet.
  const showAt = front ? "1;1;0;0" : "0;0;1;1";
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false" className={cn("pointer-events-none absolute inset-0 size-full overflow-visible", front ? "z-20" : "z-0")}>
      <g transform={`rotate(${RING.tilt} 50 50)`} fill="none" strokeLinecap="round">
        {front ? (
          <path d={FRONT_ARC} pathLength="1" strokeWidth="1.6" className="orbit-ring-draw text-primary stroke-current" opacity="0.85" />
        ) : (
          <ellipse cx="50" cy="50" rx={RING.rx} ry={RING.ry} pathLength="1" strokeWidth="1.1" className="orbit-ring-draw text-primary stroke-current" opacity="0.4" />
        )}
        {dots && animate &&
          [0, 0.5].map((phase) => (
            <g key={phase} fill="currentColor" className="text-[var(--orbit-violet)]">
              <circle r="3.4" opacity="0.2">
                <animateMotion dur="8s" begin={`-${phase * 8}s`} repeatCount="indefinite" path={BACK_PATH} />
                <animate attributeName="opacity" dur="8s" begin={`-${phase * 8}s`} repeatCount="indefinite" values={front ? "0.2;0.2;0;0" : "0;0;0.2;0.2"} keyTimes="0;0.499;0.5;1" calcMode="discrete" />
              </circle>
              <circle r="1.7">
                <animateMotion dur="8s" begin={`-${phase * 8}s`} repeatCount="indefinite" path={BACK_PATH} />
                <animate attributeName="opacity" dur="8s" begin={`-${phase * 8}s`} repeatCount="indefinite" values={showAt} keyTimes="0;0.499;0.5;1" calcMode="discrete" />
              </circle>
            </g>
          ))}
      </g>
    </svg>
  );
}

/**
 * The Orbit planet with a tilted ring and two small lights travelling along it, in front of and behind the planet.
 * The 3D PNG is drawn untouched (transparent, never stretched). Reduced motion keeps the ring and drops the travelling lights.
 */
export function OrbitalIcon({ size = 64, scale = 0.62, name = "orbit", alt, priority = false, animate = true, dots = true, bump = 0, className }) {
  const reduce = useReducedMotion();
  const { ref, paused, props } = usePauseOffscreen();
  // The travelling lights are SVG SMIL, which Chrome re-lays-out on every frame for as long as they run (measured: ~60
  // layouts a second, half of a throttled phone's main thread, with nothing else happening). At header and nav sizes
  // the lights are about half a pixel wide, so nobody can see them, yet the header pill is always on screen and so
  // never paused. Only the Orbits page hero (112 px) gets them; the feed widget (96 px) keeps its ring and planet.
  const moving = animate && !reduce && size >= MIN_ANIMATED_SIZE;

  // SMIL does not follow CSS: pause the travelling lights ourselves while off screen.
  useEffect(() => {
    const svgs = ref.current?.querySelectorAll("svg");
    svgs?.forEach((svg) => (paused ? svg.pauseAnimations?.() : svg.unpauseAnimations?.()));
  }, [paused, ref]);

  return (
    <span ref={ref} {...props} className={cn("relative inline-grid shrink-0 place-items-center", className)} style={{ width: size, height: size }}>
      <RingLayer animate={moving} dots={dots} />
      <span key={bump} className={cn("relative z-10 grid place-items-center", bump > 0 && "orbit-bump")}>
        <RewardIcon name={name} size={Math.round(size * scale)} alt={alt} priority={priority} />
      </span>
      <RingLayer front animate={moving} dots={dots} />
    </span>
  );
}

const STARS = [
  { x: "8%", y: "14%", s: 10, d: "0s" },
  { x: "88%", y: "22%", s: 8, d: "1.1s" },
  { x: "78%", y: "82%", s: 11, d: "2.2s" },
  { x: "14%", y: "76%", s: 7, d: "0.6s" },
];

/** A few tiny four-point stars that twinkle in turn. Decorative, never intercepts a click. */
export function Sparkles({ count = 4, className }) {
  const { ref, props } = usePauseOffscreen();
  return (
    <span ref={ref} aria-hidden="true" {...props} className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      {STARS.slice(0, count).map((st, i) => (
        <svg key={i} viewBox="0 0 24 24" width={st.s} height={st.s} className="orbit-twinkle absolute text-[var(--orbit-violet)]" style={{ left: st.x, top: st.y, animationDelay: st.d }}>
          <path d="M12 0c.9 6.6 4.4 10.1 12 12-7.6 1.9-11.1 5.4-12 12-.9-6.6-4.4-10.1-12-12C7.6 10.1 11.1 6.6 12 0z" fill="currentColor" />
        </svg>
      ))}
    </span>
  );
}

/**
 * A progress ring that shows `value` of `max`. The stroke is drawn once when it first appears and eases when the value
 * changes later. At rest it is exactly value/max, with or without JavaScript.
 */
export function ProgressRing({ value, max, size = 56, label, children, className, tone = "text-primary" }) {
  const ratio = Math.max(0, Math.min(1, value / Math.max(1, max)));
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} className={cn("relative grid shrink-0 place-items-center", className)} style={{ width: size, height: size }}>
      <svg viewBox="0 0 36 36" aria-hidden="true" focusable="false" className="absolute inset-0 size-full -rotate-90">
        <circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="3" className="stroke-border" />
        <circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="3" strokeLinecap="round" pathLength="1" strokeDashoffset={1 - ratio} className={cn("orbit-ring-fill stroke-current", tone)} style={ratio === 0 ? { opacity: 0 } : undefined} />
      </svg>
      <span className="relative">{children}</span>
    </div>
  );
}

/** "+5 Orbits": floats up and fades. Only render it with a server-confirmed amount; it is decorative (a live region says it). */
export function GainChip({ amount, className }) {
  if (!amount) return null;
  return (
    <span aria-hidden="true" className={cn("orbit-gain bg-success-soft text-success-text pointer-events-none absolute z-30 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums shadow-sm", className)}>
      +{amount} Orbits
    </span>
  );
}
