import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { AnimatedNumber } from "@/components/orbits/animated-number";
import { RewardIcon } from "@/components/orbits/reward-icon";
import { OrbitalIcon, ProgressRing, Sparkles } from "@/components/orbits/fx";
import { KIND_LABEL } from "@/lib/orbits/icons";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const weekday = (day, style = "short") => new Intl.DateTimeFormat("en-IN", { weekday: style, timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));

export function Section({ title, eyebrow, action, children, className, ...rest }) {
  return (
    <section className={cn("surface p-4 sm:p-5", className)} {...rest}>
      {(title || action) && (
        <header className="mb-3 flex items-center justify-between gap-3">
          <div>
            {eyebrow && <p className="eyebrow mb-0.5">{eyebrow}</p>}
            {title && <h2 className="text-base font-bold">{title}</h2>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function SeeAll({ href, children }) {
  return (
    <Link href={href} className="text-primary-text inline-flex items-center gap-1 rounded text-sm font-semibold hover:underline">
      {children} <ArrowRight className="size-3.5" aria-hidden="true" />
    </Link>
  );
}

export function Progress({ value, max, label }) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} className="bg-muted h-2 overflow-hidden rounded-full">
      <div className="bg-primary orbit-grow-x h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Orbit Balance: the number, what was earned today and this week, and progress to the nearest unearned badge. */
export function BalanceCard({ overview }) {
  const max = Math.max(1, ...overview.week_days.map((d) => d.earned));
  const next = overview.next_achievement;
  return (
    <Section aria-label="Orbit Balance" className="relative space-y-4 overflow-hidden border-[var(--orbit-line)] bg-[var(--orbit-wash)]">
      <Sparkles count={3} />
      <div className="relative flex items-center gap-4">
        <OrbitalIcon size={112} scale={0.62} alt="Orbit" priority className="-ml-3" />
        <div className="min-w-0">
          <p className="eyebrow">Orbit Balance</p>
          <p className="font-heading text-4xl leading-none font-extrabold tracking-tight sm:text-5xl" data-testid="orbit-balance">
            <AnimatedNumber value={overview.balance} />
          </p>
          <p className="text-muted-foreground mt-1.5 text-sm">
            <span className="text-success-text font-semibold">+{overview.earned_today.toLocaleString("en-IN")} today</span> · {overview.earned_week.toLocaleString("en-IN")} this week
          </p>
        </div>
      </div>

      <div>
        <p className="eyebrow mb-2">Last 7 days</p>
        <ol className="grid grid-cols-7 gap-1.5">
          {overview.week_days.map((d, i) => (
            <li key={d.day} className="flex flex-col items-center gap-1" aria-label={`${weekday(d.day, "long")}: ${d.earned} Orbits`}>
              <div className="bg-muted flex h-14 w-full items-end overflow-hidden rounded-md">
                <div className={cn("w-full rounded-md", d.earned > 0 && "bg-primary/80 orbit-grow-y")} style={{ height: d.earned > 0 ? `${Math.max(12, (d.earned / max) * 100)}%` : 0, animationDelay: `${i * 60}ms` }} />
              </div>
              <span className="text-muted-foreground text-[11px] font-medium">{weekday(d.day)}</span>
              <span className="text-[11px] font-semibold tabular-nums">{d.earned}</span>
            </li>
          ))}
        </ol>
      </div>

      {next && (
        <Link href="/orbits/achievements" className="hover:bg-card hover:border-primary/40 flex items-center gap-3 rounded-xl border bg-card/70 p-3 transition-[background-color,border-color,transform] active:scale-[0.99]">
          <ProgressRing value={next.progress} max={next.target} size={52} label={`${next.title} ring`}><RewardIcon name={next.icon} imageKey={next.image_key} size={26} locked /></ProgressRing>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">Next badge: {next.title}</p>
            <div className="mt-1.5"><Progress value={next.progress} max={next.target} label={`${next.title} progress`} /></div>
            <p className="text-muted-foreground mt-1 text-xs tabular-nums">{next.progress} of {next.target}</p>
          </div>
        </Link>
      )}
    </Section>
  );
}

/** Orbit Streak: contribution days only (a check-in does not count), with the rules spelled out. */
export function StreakCard({ overview }) {
  const s = overview.streak;
  const remaining = s.next_milestone ? Math.max(0, s.next_milestone - s.current) : 0;
  return (
    <Section aria-label="Orbit Streak" className="space-y-4">
      <div className="flex items-center gap-4">
        <ProgressRing value={s.current} max={s.next_milestone ?? Math.max(1, s.current)} size={80} label={s.next_milestone ? `Progress to a ${s.next_milestone}-day streak` : "Streak"} tone="text-coral"><RewardIcon name="flame" size={48} alt="Streak flame" /></ProgressRing>
        <div>
          <p className="eyebrow">Orbit Streak</p>
          <p className="font-heading text-3xl leading-none font-extrabold" data-testid="orbit-streak">
            {s.current} <span className="text-muted-foreground text-base font-semibold">{s.current === 1 ? "day" : "days"}</span>
          </p>
          <p className="text-muted-foreground mt-1 text-sm">Best: {s.best} {s.best === 1 ? "day" : "days"}</p>
        </div>
      </div>
      <ol className="grid grid-cols-7 gap-1.5" aria-label="This week's contributions">
        {overview.week_days.map((d, i) => (
          <li key={d.day} className="flex flex-col items-center gap-1">
            <span
              style={{ animationDelay: `${i * 55}ms` }}
              className={cn("orbit-pop grid size-9 place-items-center rounded-full border text-xs font-semibold", d.contributed ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground bg-card", d.day === overview.today && !d.contributed && "orbit-today border-primary/50")}
              aria-label={`${weekday(d.day, "long")}: ${d.contributed ? "contributed" : "no contribution"}`}
            >
              {d.contributed ? <Check className="size-4" aria-hidden="true" /> : <span aria-hidden="true">·</span>}
            </span>
            <span className="text-muted-foreground text-[11px] font-medium">{weekday(d.day)}</span>
          </li>
        ))}
      </ol>
      <p className="text-sm">
        {s.contributed_today ? "Today's contribution is in. " : "Contribute today to keep it going. "}
        {s.next_milestone && (
          <span className="text-muted-foreground">
            {remaining} more {remaining === 1 ? "day" : "days"} to reach {s.next_milestone}
            {s.next_bonus > 0 ? ` (+${s.next_bonus} Orbits)` : ""}.
          </span>
        )}
      </p>
      <details className="text-sm">
        <summary className="text-primary-text cursor-pointer rounded font-semibold">What counts as a contribution?</summary>
        <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-5">
          <li>Answering the Daily Challenge.</li>
          <li>An original post of at least {overview.rewards.post_min_chars} characters (one Orbit reward per day; posting more is always welcome).</li>
          <li>An answer that the author of a question liked.</li>
          <li>The Daily Orbit Bonus on its own does not count, and a missed day never removes Orbits you already earned.</li>
          <li>Days follow India Standard Time (UTC+5:30).</li>
        </ul>
      </details>
    </Section>
  );
}

export function ActivityList({ rows, empty = "No activity yet. Claim your Daily Orbit Bonus to start." }) {
  if (!rows.length) return <p className="text-muted-foreground text-sm">{empty}</p>;
  return (
    <ul className="divide-y" aria-label="Orbit activity">
      {rows.map((r) => (
        <li key={r.id} className="hover:bg-accent/60 -mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 text-sm transition-colors">
          <span className="min-w-0">
            <span className="block truncate font-medium">{KIND_LABEL[r.kind] ?? r.kind}</span>
            <span className="text-muted-foreground block truncate text-xs">
              {formatDate(r.created_at ?? r.day)}
              {r.reason ? ` · ${r.reason}` : ""}
            </span>
          </span>
          <span className={cn("shrink-0 font-semibold tabular-nums", r.amount > 0 ? "text-success-text" : "text-destructive-text")}>
            {r.amount > 0 ? "+" : ""}
            {r.amount}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function AchievementTile({ a, children }) {
  const earned = a.earned?.length > 0;
  const first = a.earned?.[0];
  return (
    <li className={cn("bg-card relative flex flex-col items-center gap-2 rounded-2xl border p-4 text-center transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:shadow-[var(--lift-shadow)] motion-reduce:hover:translate-y-0", !earned && "bg-muted/40", earned && "border-[var(--orbit-line)]")} data-earned={earned}>
      {!earned && <RewardIcon name="lock-keyhole" size={26} className="absolute top-2 right-2" />}
      <span className="relative grid size-[84px] place-items-center">
        {earned && (
          <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false" className="pointer-events-none absolute inset-0 size-full -rotate-90">
            <circle cx="50" cy="50" r="47" fill="none" strokeWidth="2" strokeLinecap="round" pathLength="1" className="orbit-ring-draw text-primary stroke-current" opacity="0.55" />
          </svg>
        )}
        <RewardIcon name={a.icon} imageKey={a.image_key} rank={first?.rank >= 1 && first?.rank <= 10 ? first.rank : undefined} size={68} locked={!earned} alt={earned ? `${a.title}, earned` : `${a.title}, locked`} />
      </span>
      <div className="min-w-0">
        <p className="text-sm leading-tight font-bold">{a.title}</p>
        <p className="text-muted-foreground mt-1 text-xs leading-snug">{a.description}</p>
      </div>
      <p className={cn("text-xs font-semibold", earned ? "text-success-text" : "text-muted-foreground")}>
        {earned ? `Earned ${formatDate(first.earned_at)}${first.period ? ` · ${first.period}` : ""}${first.rank ? ` · rank ${first.rank}` : ""}` : "Locked"}
      </p>
      {children}
    </li>
  );
}
