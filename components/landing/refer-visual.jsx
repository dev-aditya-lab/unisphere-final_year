"use client";

import { useRef } from "react";
import Image from "next/image";
import { Check, Link2 } from "lucide-react";
import { m, useInView } from "motion/react";
import { CountUp } from "@/components/landing/count-up";

// What a friend has done so far. Statuses only, never a name: that is how the real screen shows it. The last one earns the reward.
const FRIENDS = [
  { status: "Joined", detail: "Confirmed their email", gain: false },
  { status: "Profile set up", detail: "Added a name and interests", gain: false },
  { status: "Active on 2 days", detail: "Really in", gain: true },
];

/**
 * The Refer & Earn picture, drawn with markup so it can move: an invite link, a friend's status filling in step by step, and a big
 * Orbits planet (the reward artwork) that floats among two rings of smaller planets while "+100" rises into it. The planet floats (Motion, a loop that
 * Motion's reduced-motion setting turns off), the rings and the status loop are CSS, and every moving part stops for reduced motion,
 * leaving a complete still picture. It is described once for assistive technology and the pieces are hidden from it.
 * All people and the link are invented examples.
 */
export function ReferVisual() {
  // The floating only runs while the picture is on screen.
  const ref = useRef(null);
  const inView = useInView(ref, { margin: "120px" });
  return (
    <div
      ref={ref}
      role="img"
      aria-label="Invite friends, earn 100 Orbits. You share your invite link, a friend joins, sets up their profile and uses UniSphere on two different days, and 100 Orbits come back to you."
      className="relative mx-auto h-[30rem] w-full max-w-[34rem] sm:h-[34rem]"
    >
      <div aria-hidden="true" className="absolute inset-0">
        {/* two rings of small planets turning around the big one */}
        <div className="orbit-ring" style={{ "--inset": "6%", "--t": "26s" }}>
          <span className="orbit-moon" style={{ "--s": "3.4rem", "--t": "26s" }}>
            <Image src="/icons/reward/orbit.png" alt="" width={64} height={64} sizes="3.4rem" className="size-full" />
          </span>
        </div>
        <div className="orbit-ring" style={{ "--inset": "20%", "--t": "18s" }}>
          <span className="orbit-moon" style={{ "--s": "2.4rem", "--t": "18s" }}>
            <Image src="/icons/reward/orbit.png" alt="" width={64} height={64} sizes="2.4rem" className="size-full" />
          </span>
          <span className="orbit-moon orbit-moon-opposite" style={{ "--s": "2.4rem", "--t": "18s" }}>
            <Image src="/icons/reward/orbit.png" alt="" width={64} height={64} sizes="2.4rem" className="size-full" />
          </span>
        </div>

        {/* the Orbits planet, with the reward on it */}
        <m.div
          className="absolute top-1/2 left-1/2 -mt-[8rem] -ml-[8rem] sm:-mt-[9.5rem] sm:-ml-[9.5rem]"
          animate={inView ? { y: [0, -14, 0] } : { y: 0 }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        >
          <div className="relative size-[16rem] sm:size-[19rem]">
            <Image src="/icons/reward/orbit.png" alt="" width={500} height={500} sizes="19rem" className="size-full drop-shadow-[0_30px_60px_rgba(47,99,240,0.55)]" />
            <span className="bg-primary text-primary-foreground font-display absolute -bottom-3 left-1/2 flex -translate-x-1/2 items-baseline gap-2 rounded-full px-6 py-2 shadow-[0_18px_40px_-14px_rgba(47,99,240,0.9)]">
              <span className="text-3xl leading-none font-bold tracking-[-0.04em] tabular-nums sm:text-4xl">
                <CountUp to={100} />
              </span>
              <span className="text-[0.7rem] font-bold tracking-[0.18em] uppercase">Orbits</span>
            </span>
          </div>
        </m.div>

        {/* the invite link */}
        <m.div
          className="refer-card absolute top-2 left-0 w-[15.5rem] sm:w-[17rem]"
          style={{ rotate: -4 }}
          animate={inView ? { y: [0, 10, 0] } : { y: 0 }}
          transition={{ duration: 7.5, repeat: Infinity, ease: "easeInOut" }}
        >
          <p className="text-band-muted text-[11px] font-semibold tracking-[0.14em] uppercase">Your invite link</p>
          <div className="mt-2 flex items-center gap-2">
            <Link2 className="text-signal-text size-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">unispheres.in/?ref=YOURCODE</span>
            <span className="bg-primary text-primary-foreground rounded-full px-2.5 py-1 text-[11px] font-bold">Copy</span>
          </div>
        </m.div>

        {/* a friend's progress, one step after another, with the reward rising from the last */}
        <div className="absolute right-0 bottom-2 flex w-[15.5rem] flex-col gap-2.5 sm:w-[17rem]">
          {FRIENDS.map((friend, i) => (
            <div key={friend.status} className="friend refer-card flex items-center gap-3" style={{ "--i": i }}>
              <span className="bg-signal text-primary-foreground grid size-7 shrink-0 place-items-center rounded-full">
                <Check className="size-4" strokeWidth={3} />
              </span>
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block text-sm font-semibold">{friend.status}</span>
                <span className="text-band-muted block text-xs">{friend.detail}</span>
              </span>
              {friend.gain && <span className="gain font-display text-signal-text absolute -top-3 right-4 text-lg font-bold" style={{ "--i": i }}>+100</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
