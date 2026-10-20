"use client";

import Link from "next/link";
import { OrbitalIcon } from "@/components/orbits/fx";
import { AnimatedNumber } from "@/components/orbits/animated-number";
import { RewardIcon } from "@/components/orbits/reward-icon";
import { glanceStatus } from "@/components/orbits/header-pill";
import { useGlance } from "@/lib/orbits/glance-store";

/** The Orbits entry's icon in the sidebar and the More sheet: the planet with its slow ring, and a dot only for something new. */
export function OrbitNavMark({ size = 28 }) {
  const glance = useGlance();
  const status = glanceStatus(glance);
  return (
    <span className="relative -my-1 -ml-1 inline-grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <OrbitalIcon size={size} scale={0.62} />
      {status && (
        <>
          <span aria-hidden="true" className="bg-coral ring-card absolute top-0 right-0 size-2 rounded-full ring-2" />
          <span className="sr-only">{status}</span>
        </>
      )}
    </span>
  );
}

/** A dot on the More tab when the Orbits entry inside it has something genuinely new. Decorative, with its reason in words. */
export function MoreDot() {
  const status = glanceStatus(useGlance());
  if (!status) return null;
  return (
    <>
      <span aria-hidden="true" className="bg-coral ring-card absolute top-2 left-1/2 ml-2.5 size-2 rounded-full ring-2" />
      <span className="sr-only">, Orbits: {status}</span>
    </>
  );
}

/** The first thing in the More sheet: Orbits at a glance (balance and streak straight from the server's numbers). */
export function OrbitMoreCard({ onNavigate }) {
  const glance = useGlance();
  const status = glanceStatus(glance);
  return (
    <Link
      href="/orbits"
      onClick={onNavigate}
      className="focus-visible:ring-ring/40 flex items-center gap-3 rounded-2xl border border-[var(--orbit-line)] bg-[var(--orbit-wash)] p-3 outline-none focus-visible:ring-[3px] active:scale-[0.99]"
    >
      <OrbitalIcon size={56} scale={0.62} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold">Orbits</span>
        {glance ? (
          <span className="text-muted-foreground flex items-center gap-2 text-xs">
            <span className="text-foreground font-bold tabular-nums"><AnimatedNumber value={glance.balance} /></span> Orbits
            <span className="inline-flex items-center gap-0.5"><RewardIcon name="flame" size={14} /> {glance.streak.current}-day streak</span>
          </span>
        ) : (
          <span className="text-muted-foreground block text-xs">Rewards, streak and daily challenge</span>
        )}
        {status && <span className="text-primary-text block text-xs font-semibold">{status[0].toUpperCase() + status.slice(1)}</span>}
      </span>
    </Link>
  );
}
