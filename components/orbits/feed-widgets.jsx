"use client";

import { useRef } from "react";
import Link from "next/link";
import { ArrowRight, ChevronRight, Loader2, TrendingDown } from "lucide-react";
import { CircleAlert, TrendingUp } from "@/components/icons/lucide-compat";
import { AnimatedNumber, useIncrease } from "@/components/orbits/animated-number";
import { GainChip, OrbitalIcon, ProgressRing, Sparkles, usePointerDepth } from "@/components/orbits/fx";
import { RewardIcon } from "@/components/orbits/reward-icon";
import { useClaimCheckin } from "@/components/orbits/use-claim";
import { useGlance } from "@/lib/orbits/glance-store";
import { cn } from "@/lib/utils";

const n = (v) => Number(v).toLocaleString("en-IN");

/** Where today's reward-related next step is, from the server's own state: bonus, then challenge, then done. */
function nextStep(glance, claimed) {
  if (!claimed) return "claim";
  if (glance?.challenge && !glance.challenge.answered) return "challenge";
  return "done";
}

function StreakLine({ streak, showToday = true }) {
  if (!streak) return null;
  const left = streak.next_milestone ? Math.max(0, streak.next_milestone - streak.current) : 0;
  const goal = streak.next_milestone ? `${left} ${left === 1 ? "day" : "days"} to ${streak.next_bonus > 0 ? `+${streak.next_bonus} Orbits` : `${streak.next_milestone}-day mark`}` : "";
  return (
    <>
      <p className="text-sm leading-tight font-bold tabular-nums">
        {streak.current} {streak.current === 1 ? "day" : "days"}
        {showToday && <span className="text-muted-foreground ml-1.5 text-xs font-medium">{streak.contributed_today ? "Today counts" : "Contribute today"}</span>}
      </p>
      {goal && <p className="text-muted-foreground text-xs leading-snug">{goal}</p>}
    </>
  );
}

/** The one action that matters right now. Claiming asks the server; the words and the state come from the server's answer. */
function ActionButton({ glance, claim, claimed, pending, className }) {
  const step = nextStep(glance, claimed);
  const ref = useRef(null);
  const base = "orbit-glint relative inline-flex h-10 w-full items-center justify-center gap-2 overflow-hidden rounded-xl px-4 text-sm font-semibold outline-none transition-[transform,box-shadow] duration-150 focus-visible:ring-[3px] focus-visible:ring-ring/40 active:scale-[0.98]";
  if (step === "claim") {
    return (
      <button ref={ref} type="button" onClick={() => claim(ref.current)} disabled={pending} aria-busy={pending} className={cn(base, "bg-primary text-primary-foreground shadow-[0_6px_16px_-6px_color-mix(in_srgb,var(--primary)_70%,transparent)] hover:shadow-[0_8px_20px_-6px_color-mix(in_srgb,var(--primary)_80%,transparent)]", className)}>
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <RewardIcon name="calendar-check" size={22} />}
        {pending ? "Claiming…" : `Claim +${glance.checkin.reward} Orbits`}
      </button>
    );
  }
  if (step === "challenge") {
    return (
      <Link href="/orbits#challenge" className={cn(base, "bg-primary text-primary-foreground hover:shadow-[0_8px_20px_-6px_color-mix(in_srgb,var(--primary)_80%,transparent)]", className)}>
        <RewardIcon name="brain" size={22} /> Answer today&rsquo;s challenge
      </Link>
    );
  }
  return (
    <Link href="/orbits" className={cn(base.replace("orbit-glint ", ""), "border-primary/25 bg-primary-soft text-primary-text hover:bg-primary/15 border", className)}>
      Explore Orbits <ArrowRight className="size-4" aria-hidden="true" />
    </Link>
  );
}

/**
 * The full Orbits panel for the desktop feed sidebar. Everything on it is a number or state the server gave for this member:
 * balance, streak, today's bonus and challenge, the nearest badge, and the weekly standing. Nothing is awarded by looking at it.
 * Depth comes from three layers (glow, planet, sparkles) that shift a few pixels with the pointer on devices that have one.
 */
export function OrbitsWidget({ initial, next, rank }) {
  const glance = useGlance(initial);
  const depth = usePointerDepth();
  const { claimed, claim, pending, error, gain } = useClaimCheckin(initial.checkin.claimed_today);
  const bump = useIncrease(glance.balance);
  const step = nextStep(glance, claimed);
  const ch = glance.challenge;

  return (
    <section aria-label="Your Orbits" ref={depth} className="orbit-enter surface-raised relative isolate overflow-hidden border-[var(--orbit-line)] bg-[var(--orbit-wash)] p-4">
      <div aria-hidden="true" className="orbit-depth pointer-events-none absolute -top-16 -left-10 -z-10 size-52 rounded-full opacity-70" style={{ "--d": 8, background: "radial-gradient(closest-side, color-mix(in srgb, var(--primary) 20%, transparent), transparent)" }} />
      <div aria-hidden="true" className="orbit-depth pointer-events-none absolute -right-12 bottom-6 -z-10 size-44 rounded-full opacity-60" style={{ "--d": -6, background: "radial-gradient(closest-side, color-mix(in srgb, var(--orbit-violet) 16%, transparent), transparent)" }} />
      <div aria-hidden="true" className="orbit-depth pointer-events-none absolute inset-0 -z-10" style={{ "--d": 11 }}>
        <Sparkles count={3} />
      </div>

      <div className="flex items-center gap-3">
        <span className="orbit-depth relative -ml-1" style={{ "--d": 4 }}>
          <OrbitalIcon size={96} scale={0.62} bump={bump} priority />
        </span>
        <div className="relative min-w-0">
          <p className="eyebrow">Orbit Balance</p>
          <p className="font-heading text-[2rem] leading-none font-extrabold tracking-tight" data-testid="widget-orbit-balance">
            <AnimatedNumber value={glance.balance} />
          </p>
          <GainChip key={gain?.id} amount={gain?.amount} className="top-5 left-[3.25rem]" />
          <Link href="/orbits/history" className="text-primary-text mt-1 inline-flex items-center gap-0.5 rounded text-xs font-semibold hover:underline">
            See activity <ChevronRight className="size-3" aria-hidden="true" />
          </Link>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        <div className="bg-card/80 flex items-center gap-3 rounded-xl border p-2.5" role="group" aria-label="Orbit Streak">
          <RewardIcon name="flame" size={34} alt="" />
          <div className="min-w-0">
            <p className="eyebrow !text-[10px]">Streak</p>
            <StreakLine streak={glance.streak} />
          </div>
        </div>
        <div className="bg-card/80 flex items-center gap-3 rounded-xl border p-2.5" role="group" aria-label="Daily Challenge status">
          <RewardIcon name={ch?.answered ? "circle-check" : "brain"} size={34} alt="" />
          <div className="min-w-0">
            <p className="eyebrow !text-[10px]">Challenge</p>
            <p className="text-sm leading-tight font-bold">
              {!ch ? "No challenge today" : ch.answered ? "Done for today" : "Open now"}
            </p>
            <p className="text-muted-foreground text-xs leading-snug">{!ch ? "A new question comes tomorrow" : ch.answered ? "Nice work" : `Answer for up to +${ch.reward} Orbits`}</p>
          </div>
        </div>
      </div>

      {next && (
        <Link href="/orbits/achievements" className="bg-card/80 hover:bg-card mt-2 flex items-center gap-3 rounded-xl border p-2.5 transition-colors">
          <ProgressRing value={next.progress} max={next.target} size={44} label={`${next.title} progress`}>
            <RewardIcon name={next.icon} imageKey={next.image_key} size={22} locked />
          </ProgressRing>
          <div className="min-w-0 flex-1">
            <p className="eyebrow !text-[10px]">Next badge</p>
            <p className="truncate text-sm leading-tight font-bold">{next.title}</p>
            <p className="text-muted-foreground text-xs tabular-nums">{n(next.progress)} of {n(next.target)}</p>
          </div>
          <ChevronRight className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
        </Link>
      )}

      <Link href="/orbits/leaderboard" className="bg-card/80 hover:bg-card mt-2 flex items-center gap-3 rounded-xl border p-2.5 transition-colors">
        <RewardIcon name="trophy" size={34} alt="" />
        <div className="min-w-0 flex-1">
          <p className="eyebrow !text-[10px]">This week · Global</p>
          {!rank ? (
            <p className="text-muted-foreground text-sm">Leaderboard unavailable right now.</p>
          ) : !rank.participating ? (
            <p className="text-muted-foreground text-sm leading-tight">You are not on leaderboards.</p>
          ) : rank.rank ? (
            <>
              <p className="text-sm leading-tight font-bold tabular-nums">
                #{n(rank.rank)} <span className="text-muted-foreground font-medium">of {n(rank.total)}</span>
                {rank.prev_rank && Number(rank.prev_rank) !== Number(rank.rank) ? (
                  <span className={cn("ml-1.5 inline-flex items-center gap-0.5 text-xs font-semibold", Number(rank.prev_rank) > Number(rank.rank) ? "text-success-text" : "text-destructive-text")}>
                    {Number(rank.prev_rank) > Number(rank.rank) ? <TrendingUp className="size-3" aria-hidden="true" /> : <TrendingDown className="size-3" aria-hidden="true" />}
                    {Number(rank.prev_rank) > Number(rank.rank) ? `up ${Number(rank.prev_rank) - Number(rank.rank)}` : `down ${Number(rank.rank) - Number(rank.prev_rank)}`}
                  </span>
                ) : null}
              </p>
              <p className="text-muted-foreground text-xs tabular-nums">{n(rank.score)} Orbits so far</p>
            </>
          ) : (
            <p className="text-muted-foreground text-sm leading-tight">Earn Orbits to appear.</p>
          )}
        </div>
        <ChevronRight className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
      </Link>

      <div className="mt-3">
        <ActionButton glance={glance} claim={claim} claimed={claimed} pending={pending} />
        <p role="status" className={cn("mt-1.5 text-xs font-medium", error ? "text-destructive-text" : "text-success-text", !error && !gain && "sr-only")}>
          {error ? (
            <span className="flex items-center gap-1"><CircleAlert className="size-3.5 shrink-0" aria-hidden="true" /> {error}</span>
          ) : gain ? (
            `You earned +${gain.amount} Orbits. Your balance is now ${n(glance.balance)}.`
          ) : step === "done" ? (
            "Today is done."
          ) : (
            ""
          )}
        </p>
      </div>
    </section>
  );
}

/** Same shape, shown while the real numbers load (or if they cannot be read). Fixed height, so the sidebar does not jump. */
export function OrbitsWidgetSkeleton() {
  return (
    <div aria-hidden="true" className="surface-raised border-[var(--orbit-line)] p-4">
      <div className="flex items-center gap-3">
        <div className="skeleton size-20 rounded-full" />
        <div className="flex-1 space-y-2"><div className="skeleton h-3 w-24" /><div className="skeleton h-8 w-28" /></div>
      </div>
      <div className="mt-3 space-y-2"><div className="skeleton h-14" /><div className="skeleton h-14" /></div>
      <div className="skeleton mt-2 h-16" />
      <div className="skeleton mt-2 h-14" />
      <div className="skeleton mt-3 h-10" />
    </div>
  );
}

export function OrbitsWidgetUnavailable() {
  return (
    <section aria-label="Your Orbits" className="surface-raised flex items-center gap-3 border-[var(--orbit-line)] bg-[var(--orbit-wash)] p-4">
      <RewardIcon name="orbit" size={44} alt="" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold">Orbits</p>
        <p className="text-muted-foreground text-xs">Your rewards could not be loaded just now.</p>
      </div>
      <Link href="/orbits" className="text-primary-text text-sm font-semibold hover:underline">Open</Link>
    </section>
  );
}

/**
 * A compact "today" row for screens too narrow for the sidebar widget: the balance, the streak, and the one next step, on a
 * single line (it used to be three cards that scrolled sideways above the posts). It repeats nothing from the header beyond the
 * balance itself. The step is state-aware: claim the bonus, then answer the challenge, then "all done".
 */
export function OrbitsStrip({ initial }) {
  const glance = useGlance(initial);
  const { claimed, claim, pending, error, gain } = useClaimCheckin(initial.checkin.claimed_today);
  const bump = useIncrease(glance.balance);
  const step = nextStep(glance, claimed);
  const ch = glance.challenge;
  const claimRef = useRef(null);
  const focus = "focus-visible:ring-ring/40 rounded-xl outline-none focus-visible:ring-[3px]";
  const pill = "orbit-glint relative flex h-10 shrink-0 items-center gap-1.5 overflow-hidden rounded-xl px-3 text-[13px] font-bold whitespace-nowrap transition-transform duration-150 active:scale-95";

  return (
    <section aria-label="Your Orbits today" className="orbit-enter xl:hidden">
      <div className="bg-card/90 flex min-h-14 items-center gap-1 rounded-2xl border border-[var(--orbit-line)] bg-[var(--orbit-wash)] py-1 pr-1.5 pl-1">
        <Link href="/orbits" className={cn(focus, "relative flex min-w-0 items-center gap-1")}>
          <OrbitalIcon size={48} scale={0.62} bump={bump} />
          <span className="min-w-0">
            <span className="eyebrow block !text-[10px] leading-none">Orbits</span>
            <span className="font-heading block text-lg leading-tight font-extrabold" data-testid="strip-orbit-balance">
              <AnimatedNumber value={glance.balance} />
            </span>
          </span>
          <GainChip key={gain?.id} amount={gain?.amount} className="top-1 left-12" />
        </Link>

        {glance.streak ? (
          <Link href="/orbits" className={cn(focus, "ml-1 flex shrink-0 items-center gap-1 px-1.5 py-1")} aria-label={`Orbit Streak: ${glance.streak.current} ${glance.streak.current === 1 ? "day" : "days"}`}>
            <RewardIcon name="flame" size={28} alt="" />
            <span className="text-sm font-bold tabular-nums">
              {glance.streak.current}
              <span className="text-muted-foreground max-[420px]:sr-only text-xs font-medium"> day{glance.streak.current === 1 ? "" : "s"}</span>
            </span>
          </Link>
        ) : null}

        <span className="ml-auto" />
        {step === "claim" ? (
          <button ref={claimRef} type="button" onClick={() => claim(claimRef.current)} disabled={pending} aria-busy={pending} className={cn(pill, focus, "bg-primary text-primary-foreground")}>
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <RewardIcon name="calendar-check" size={20} alt="" />}
            {pending ? "Claiming…" : (
              <span>
                Claim +{glance.checkin.reward}<span className="max-[420px]:sr-only"> Orbits</span>
              </span>
            )}
          </button>
        ) : step === "challenge" ? (
          <Link href="/orbits#challenge" className={cn(pill, focus, "bg-primary text-primary-foreground")}>
            <RewardIcon name="brain" size={20} alt="" />
            <span>
              Daily Challenge<span className="max-[420px]:sr-only"> +{ch.reward}</span>
            </span>
          </Link>
        ) : (
          <Link href="/orbits" className={cn(pill.replace("orbit-glint ", ""), focus, "border-primary/25 bg-primary-soft text-primary-text border")}>
            <RewardIcon name="circle-check" size={20} alt="" />
            All done
          </Link>
        )}
      </div>
      <p role="status" className={cn("mt-1.5 px-1 text-xs font-medium", error ? "text-destructive-text" : "text-success-text", !error && !gain && "sr-only")}>
        {error || (gain ? `You earned +${gain.amount} Orbits. Your balance is now ${n(glance.balance)}.` : "")}
      </p>
    </section>
  );
}
