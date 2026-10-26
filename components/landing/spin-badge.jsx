"use client";

import { useId, useRef } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { m, useAnimationFrame, useInView, useMotionValue, useReducedMotion, useScroll, useSpring, useVelocity } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * A round "join" button whose ring of text turns slowly, and turns faster while the page is scrolling (Motion). The ring is
 * decoration (hidden from assistive technology); the link's own label is what is announced. Reduced motion holds it still, and
 * that preference is applied inside the frame loop, never to the rendered tree.
 */
export function SpinBadge({ href, label, text, className }) {
  const id = useId();
  const reduce = useReducedMotion();
  // It only turns while it is on screen.
  const ref = useRef(null);
  const onScreen = useInView(ref, { margin: "100px" });
  const rotate = useMotionValue(0);
  const { scrollY } = useScroll();
  const velocity = useVelocity(scrollY);
  const smooth = useSpring(velocity, { damping: 50, stiffness: 400 });

  useAnimationFrame((_, delta) => {
    if (reduce || !onScreen) return;
    rotate.set(rotate.get() + delta * 0.024 + Math.abs(smooth.get()) * delta * 0.00035);
  });

  return (
    <Link ref={ref} href={href} aria-label={label} className={cn("group bg-foreground text-background relative grid size-32 shrink-0 place-items-center rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-offset-4 sm:size-36", className)}>
      <m.svg aria-hidden="true" viewBox="0 0 200 200" style={{ rotate }} className="absolute inset-0 size-full">
        <defs>
          <path id={`${id}-ring`} d="M100,100 m-76,0 a76,76 0 1,1 152,0 a76,76 0 1,1 -152,0" />
        </defs>
        <text fill="currentColor" fontSize="15.5" fontWeight="600" letterSpacing="3.2" style={{ fontFamily: "inherit", textTransform: "uppercase" }}>
          <textPath href={`#${id}-ring`} textLength="468" lengthAdjust="spacing">
            {text}
          </textPath>
        </text>
      </m.svg>
      <span className="bg-primary text-primary-foreground grid size-14 place-items-center rounded-full transition-transform duration-500 ease-out group-hover:scale-110 group-hover:rotate-45 sm:size-16">
        <ArrowUpRight className="size-7" aria-hidden="true" />
      </span>
    </Link>
  );
}
