"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatedNumber, useIncrease } from "@/components/orbits/animated-number";
import { OrbitalIcon } from "@/components/orbits/fx";
import { refreshGlanceAction } from "@/lib/actions/orbits";
import { ORBITS_CHANGED, publishGlance, useGlance } from "@/lib/orbits/glance-store";
import { cn } from "@/lib/utils";

const STALE_MS = 45_000;

/**
 * Keeps the numbers fresh without a request on every click: it asks the server again after a navigation, when the tab comes
 * back, or when another part of the app says Orbits may have changed, but never more than once per interval (and only while
 * the tab is visible). Failures are ignored: the last confirmed numbers simply stay.
 */
function useGlanceSync() {
  const pathname = usePathname();
  const last = useRef(0);

  const refresh = useRef(async () => {
    last.current = Date.now();
    try {
      const res = await refreshGlanceAction();
      if (res?.ok) publishGlance(res.data);
    } catch {
      /* offline or rate-limited: keep what we have */
    }
  });

  useEffect(() => {
    if (last.current === 0) {
      last.current = Date.now(); // the server rendered fresh numbers with this page
      return;
    }
    const gap = pathname.startsWith("/orbits") ? 8_000 : STALE_MS;
    if (document.visibilityState === "visible" && Date.now() - last.current > gap) refresh.current();
  }, [pathname]);

  useEffect(() => {
    const run = refresh.current;
    const onVisible = () => document.visibilityState === "visible" && Date.now() - last.current > STALE_MS && run();
    const onChanged = () => Date.now() - last.current > 5_000 && run();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(ORBITS_CHANGED, onChanged);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(ORBITS_CHANGED, onChanged);
    };
  }, []);
}

/** What the pill says about the member's state, in words (never colour alone). */
export function glanceStatus(glance) {
  if (!glance) return "";
  if (glance.pending > 0) return "new badge unlocked";
  if (!glance.checkin.claimed_today) return "daily bonus ready";
  return "";
}

/**
 * The Orbits entry in the top bar: the planet with its ring, the balance, a dot only when there is something genuinely new
 * (a badge you have not seen, or today's bonus waiting). The balance is the server's number, kept fresh by the sync above.
 */
export function OrbitPill({ initial }) {
  const glance = useGlance(initial);
  useGlanceSync();
  const pathname = usePathname();
  const active = pathname === "/orbits" || pathname.startsWith("/orbits/");
  const bump = useIncrease(glance?.balance ?? 0);
  const status = glanceStatus(glance);
  const name = glance ? `Orbits, ${glance.balance.toLocaleString("en-IN")} Orbits${status ? `, ${status}` : ""}` : "Orbits";

  return (
    <Link
      href="/orbits"
      aria-label={name}
      aria-current={active ? "page" : undefined}
      title="Orbits: your balance, streak and daily challenge"
      data-testid="orbit-pill"
      className={cn(
        "group focus-visible:ring-ring/45 relative mr-0.5 flex h-9 min-w-[4.5rem] items-center gap-0.5 rounded-full border pr-3 pl-0.5 text-sm font-bold transition-[box-shadow,background-color,border-color] duration-150 outline-none focus-visible:ring-[3px]",
        "border-[var(--orbit-line)] bg-[var(--orbit-wash)] hover:border-primary/50 hover:shadow-[0_0_0_3px_color-mix(in_srgb,var(--primary)_14%,transparent)] active:scale-[0.97]",
        active && "border-primary/60 shadow-[0_0_0_3px_color-mix(in_srgb,var(--primary)_14%,transparent)]",
      )}
    >
      <OrbitalIcon size={34} scale={0.6} bump={bump} />
      {glance ? (
        <AnimatedNumber value={glance.balance} className="text-foreground min-w-[1.5ch] text-[13px] leading-none sm:text-sm" />
      ) : (
        <span className="text-foreground text-[13px] leading-none">Orbits</span>
      )}
      {status && <span aria-hidden="true" className="bg-coral ring-card absolute -top-0.5 -right-0.5 size-2.5 rounded-full ring-2" />}
    </Link>
  );
}

export function OrbitPillSkeleton() {
  return <div aria-hidden="true" className="skeleton mr-0.5 h-9 w-[4.75rem] rounded-full" />;
}
