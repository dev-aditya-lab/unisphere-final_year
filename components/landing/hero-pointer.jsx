"use client";

import { createContext, useContext } from "react";
import { m, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";

/**
 * Pointer depth for the hero: the cards in front of the picture drift a few pixels against the mouse, each by its own amount,
 * so the picture reads as a scene with layers. A spring smooths the pointer, only a real mouse drives it (a finger or pen
 * does nothing), and reduced motion leaves everything still. Content is passed in from the server; only the movement is here.
 *
 * The rendered markup must not depend on the reduced-motion preference (the server cannot know it, and a different first
 * render on the client is a hydration mismatch), so that preference is applied inside the values and handlers, never to the tree.
 */
const Pointer = createContext(null);

export function HeroPointer({ children, className }) {
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const x = useSpring(px, { stiffness: 90, damping: 18, mass: 0.6 });
  const y = useSpring(py, { stiffness: 90, damping: 18, mass: 0.6 });
  const reduce = useReducedMotion();

  const onMove = (event) => {
    if (reduce || event.pointerType !== "mouse") return;
    const rect = event.currentTarget.getBoundingClientRect();
    px.set((event.clientX - rect.left) / rect.width - 0.5);
    py.set((event.clientY - rect.top) / rect.height - 0.5);
  };
  const onLeave = () => {
    px.set(0);
    py.set(0);
  };

  return (
    <Pointer.Provider value={{ x, y, reduce }}>
      <div className={className} onPointerMove={onMove} onPointerLeave={onLeave}>
        {children}
      </div>
    </Pointer.Provider>
  );
}

export function HeroLayer({ depth = 10, className, children }) {
  const { x, y, reduce } = useContext(Pointer);
  const tx = useTransform(x, (v) => (reduce ? 0 : v * depth * 2));
  const ty = useTransform(y, (v) => (reduce ? 0 : v * depth * 2));
  return (
    <m.div className={className} style={{ x: tx, y: ty }} whileHover={reduce ? undefined : { scale: 1.025 }} transition={{ type: "spring", stiffness: 300, damping: 22 }}>
      {children}
    </m.div>
  );
}
