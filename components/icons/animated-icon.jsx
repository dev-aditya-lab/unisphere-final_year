"use client";

import { useEffect, useRef, useState } from "react";
import { AppIcon } from "@/components/icons/app-icon";
import { PopIcon } from "@/components/motion/pop-icon";

/**
 * <AppIcon> with motion for things that actually happen:
 *  - `active`  a toggle turned on (liked, saved, followed): the icon fills in and pops with a spring; when off it is the quiet outline.
 *  - `pulse`   any value that changes when an event occurs (an unread count going up, a message sent, a score changing): the
 *              icon plays its own motion once (the bell swings, the plane flies, ...). The first render never plays.
 *
 * It does not run a loop and does not touch the layout; the motion is a CSS animation of the drawing's parts, one at a time, and
 * reduced-motion members get none of it (the app root's MotionConfig and the CSS both honour the preference).
 */
export function AnimatedIcon({ active, pulse, state, fill, playFor = 900, className, ...props }) {
  const [playing, setPlaying] = useState(false);
  const last = useRef(pulse);

  useEffect(() => {
    if (Object.is(last.current, pulse)) return;
    last.current = pulse;
    setPlaying(true);
    const t = setTimeout(() => setPlaying(false), playFor);
    return () => clearTimeout(t);
  }, [pulse, playFor]);

  const toggle = active !== undefined;
  const icon = (
    <AppIcon
      {...props}
      state={state ?? (toggle && !active ? "idle" : "rest")}
      fill={fill ?? (toggle && active ? "solid" : undefined)}
      play={playing}
      className={className}
    />
  );
  return toggle ? <PopIcon active={active}>{icon}</PopIcon> : icon;
}
