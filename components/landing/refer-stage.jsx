"use client";

import { useRef } from "react";
import { useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

// Fixed positions for the rising embers (percent from the left, seconds to rise, delay in seconds), so the server and the client draw
// exactly the same thing. Alternate embers drift left and right (see .ember in landing.css).
const EMBERS = [
  [6, 11, 0], [14, 9, 2.4], [22, 12, 5.1], [31, 10, 1.2], [40, 13, 6.4], [48, 9, 3.3],
  [57, 11, 7.8], [66, 10, 0.8], [74, 12, 4.2], [82, 9, 6.9], [90, 11, 2.1], [96, 10, 5.6],
];

/**
 * The Refer & Earn spotlight: a rounded stage with a royal-blue glow bleeding into black, a soft light that follows the pointer, a
 * thin light that circles its edge, slow drifting colour and embers rising through it. The gradient stays inside this one stage, in
 * the page's own black and blue, so it highlights the section without becoming the site's look.
 *
 * Everything decorative is aria-hidden and is plain markup (the same on server and client). The pointer light writes two CSS
 * variables straight to the element (no React state); reduced motion switches the motion off and leaves the still gradient.
 * The stage's content is passed in from the server.
 */
export function ReferStage({ children, className }) {
  const ref = useRef(null);
  const reduce = useReducedMotion();

  const onMove = (event) => {
    const el = ref.current;
    if (!el || reduce || event.pointerType !== "mouse") return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${event.clientX - rect.left}px`);
    el.style.setProperty("--my", `${event.clientY - rect.top}px`);
  };

  return (
    <div ref={ref} onPointerMove={onMove} data-refer-stage data-pause-offscreen className={cn("refer-stage", className)}>
      <span aria-hidden="true" className="refer-glow" />
      <span aria-hidden="true" className="refer-grid" />
      <span aria-hidden="true" className="refer-shift">
        <span className="refer-blob refer-blob-a" />
        <span className="refer-blob refer-blob-b" />
      </span>
      <span aria-hidden="true" className="refer-embers">
        {EMBERS.map(([x, t, d], i) => (
          <i key={i} className="ember" style={{ "--x": `${x}%`, "--t": `${t}s`, "--d": `${d}s` }} />
        ))}
      </span>
      <div className="relative z-[2]">{children}</div>
    </div>
  );
}
