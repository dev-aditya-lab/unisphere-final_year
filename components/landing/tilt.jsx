"use client";

import { m, useMotionValue, useReducedMotion, useSpring } from "motion/react";

/**
 * A card that tilts toward the pointer in 3D, rises a little and presses on tap (Motion springs, so it follows the pointer in and
 * out without a jump). Only a real mouse drives the tilt, and reduced motion leaves the card still; that preference is read inside
 * the handler, never used to change what is rendered (the server cannot know it).
 */
export function Tilt({ children, className, max = 7 }) {
  const reduce = useReducedMotion();
  const tiltX = useMotionValue(0);
  const tiltY = useMotionValue(0);
  const rotateX = useSpring(tiltX, { stiffness: 220, damping: 20, mass: 0.6 });
  const rotateY = useSpring(tiltY, { stiffness: 220, damping: 20, mass: 0.6 });

  const onMove = (event) => {
    if (reduce || event.pointerType !== "mouse") return;
    const rect = event.currentTarget.getBoundingClientRect();
    tiltY.set(((event.clientX - rect.left) / rect.width - 0.5) * max * 2);
    tiltX.set(-((event.clientY - rect.top) / rect.height - 0.5) * max * 2);
  };
  const onLeave = () => {
    tiltX.set(0);
    tiltY.set(0);
  };

  return (
    <m.div
      className={className}
      style={{ rotateX, rotateY, transformPerspective: 900 }}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      whileHover={{ y: -6 }}
      whileTap={{ scale: 0.985 }}
      transition={{ type: "spring", stiffness: 320, damping: 24 }}
    >
      {children}
    </m.div>
  );
}
