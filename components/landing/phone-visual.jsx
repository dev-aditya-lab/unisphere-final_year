"use client";

import { useRef } from "react";
import Image from "next/image";
import { m, useInView, useReducedMotion } from "motion/react";

// What the three kinds of notification look like on a lock screen. The text is the same plain sentence the real notifications carry
// (never a message's own words), and every name and event here is invented.
const NOTES = [
  { channel: "Messages", text: "Ravi sent you 2 new messages" },
  { channel: "Replies and connections", text: "Asha replied to your post “Robotics club kit”" },
  { channel: "Events and account", text: "Hack the Campus starts tomorrow at 10:00" },
];

/**
 * A phone's lock screen, drawn with markup: three UniSphere notifications rise onto it one after another when it scrolls into view.
 * Under reduced motion it is the finished still picture. It is described once for assistive technology and the pieces are hidden
 * from it. The Android app's notification channels (lib/push-channels.js) are the three names on the cards.
 */
export function PhoneVisual() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-10% 0px" });
  const reduce = useReducedMotion();
  const shown = reduce || inView;

  return (
    <div
      ref={ref}
      role="img"
      aria-label="A phone's lock screen showing three UniSphere notifications: a new message, a reply to a post and an event reminder. None of them shows what a message says."
      className="relative mx-auto w-[17.5rem] sm:w-[19rem]"
    >
      <div aria-hidden="true" className="bg-signal/15 absolute inset-x-6 top-1/3 -z-10 h-2/3 rounded-full blur-3xl" />
      <div aria-hidden="true" className="border-foreground bg-background rounded-[2.75rem] border-[9px] p-4 shadow-2xl">
        <div className="bg-foreground/80 mx-auto h-1.5 w-16 rounded-full" />
        <p className="font-display mt-7 text-center text-5xl font-semibold tracking-[-0.04em] tabular-nums">9:41</p>
        <p className="text-muted-foreground mt-1 text-center text-xs">Tuesday, 27 October</p>
        <ul className="mt-8 space-y-2.5">
          {NOTES.map((note, i) => (
            <m.li
              key={note.text}
              initial={reduce ? false : { opacity: 0, y: 28 }}
              animate={shown ? { opacity: 1, y: 0 } : { opacity: 0, y: 28 }}
              transition={{ delay: 0.15 + i * 0.35, type: "spring", stiffness: 140, damping: 18 }}
              className="bg-card flex items-start gap-3 rounded-2xl border p-3 text-left shadow-sm"
            >
              <Image src="/logo-mark.png" alt="" width={36} height={36} className="mt-0.5 size-9 shrink-0 rounded-lg" />
              <div className="min-w-0">
                <p className="text-muted-foreground text-[10px] font-semibold tracking-wide uppercase">UniSphere · {note.channel}</p>
                <p className="mt-0.5 text-[13px] leading-snug">{note.text}</p>
              </div>
            </m.li>
          ))}
        </ul>
        <div className="bg-foreground/60 mx-auto mt-10 h-1 w-24 rounded-full" />
      </div>
    </div>
  );
}
