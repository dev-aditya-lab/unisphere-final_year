"use client";

import { useId, useState } from "react";
import { useLiveMessageCount } from "@/lib/chat/unread-store";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { m } from "motion/react";
import { Ellipsis, Plus } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ComposeLink } from "@/components/shell/compose-link";
import { NavIcon } from "@/components/shell/nav-icons";
import { CountBadge } from "@/components/motion/count-badge";
import { MoreDot, OrbitMoreCard, OrbitNavMark } from "@/components/orbits/nav-bits";
import { ReferNavChip, ReferNavMark } from "@/components/referrals/nav-mark";
import { MOBILE_BOTTOM_HREFS, NAV_GROUPS, shouldPrefetch } from "@/lib/nav";
import { NavPending } from "@/components/shell/nav-pending";
import { EASE } from "@/lib/motion";
import { tapHaptic } from "@/lib/native/haptics";
import { cn } from "@/lib/utils";

const isActive = (pathname, href) => pathname === href || pathname.startsWith(`${href}/`);

const TAB = "relative flex h-14 w-full flex-col items-center justify-center gap-0.5 rounded-2xl text-[10.5px] leading-none font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50 active:scale-95";

/** The soft pill behind the current tab; it slides from one tab to the next. */
function Indicator({ id }) {
  return <m.span layoutId={id} aria-hidden="true" transition={EASE.spring} className="bg-primary-soft absolute inset-x-1 inset-y-0.5 rounded-2xl" />;
}

function Tab({ item, count, active, indicatorId }) {
  const { href, label, icon } = item;
  return (
    <Link
      href={href}
      prefetch={shouldPrefetch(href) ? undefined : false}
      aria-current={active ? "page" : undefined}
      onClick={tapHaptic}
      className={cn(TAB, active ? "text-primary-text" : "text-muted-foreground")}
    >
      {active && <Indicator id={indicatorId} />}
      <span className="relative">
        <NavIcon name={icon} active={active} size={24} />
        <CountBadge value={count ?? 0} label="unread" className="ring-card absolute -top-2 -right-3 h-4 min-w-4 px-1 text-[10px] ring-2" />
      </span>
      <span className="relative">{label}</span>
      <NavPending className="absolute top-1.5 right-3" />
    </Link>
  );
}

/** Every destination, as a grouped grid in a bottom sheet. */
function MoreSheet({ open, onOpenChange, items, counts, liveMessages }) {
  const pathname = usePathname();
  const groups = NAV_GROUPS.map((g) => ({ ...g, items: items.filter((i) => i.group === g.id) })).filter((g) => g.items.length > 0);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[88dvh] gap-0 overflow-y-auto overscroll-contain rounded-t-3xl p-0">
        <span aria-hidden="true" className="bg-border mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full" />
        <SheetHeader className="px-5 pt-3 pb-1 text-left">
          <SheetTitle className="font-heading text-xl font-extrabold">Explore UniSphere</SheetTitle>
          <SheetDescription className="sr-only">All sections of UniSphere</SheetDescription>
        </SheetHeader>
        <nav aria-label="All sections" className="space-y-6 px-4 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          {items.some((i) => i.href === "/orbits") && <OrbitMoreCard onNavigate={() => onOpenChange(false)} />}
          {groups.map((group) => (
            <div key={group.id}>
              <p className="eyebrow mb-2">{group.label}</p>
              <ul className="grid grid-cols-3 gap-2.5">
                {group.items.map(({ href, label, icon }) => {
                  const active = isActive(pathname, href);
                  const count = href === "/messages" ? liveMessages : counts[href];
                  return (
                    <li key={href}>
                      <Link
                        href={href}
                        prefetch={shouldPrefetch(href) ? undefined : false}
                        onClick={() => onOpenChange(false)}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "relative flex min-h-[5.25rem] flex-col items-center justify-center gap-2 rounded-2xl border px-1 py-2.5 text-center text-xs font-semibold shadow-xs transition-[transform,colors] active:scale-95",
                          active ? "border-primary/40 bg-primary-soft text-primary-text" : "bg-card text-foreground hover:bg-accent",
                          href === "/referrals" && !active && "border-[var(--orbit-line)] bg-gradient-to-b from-primary-soft/70 to-card",
                        )}
                      >
                        <span className="relative">
                          {href === "/orbits" ? <OrbitNavMark size={30} /> : href === "/referrals" ? <ReferNavMark size={26} active={active} /> : <NavIcon name={icon} active={active} size={26} />}
                          <CountBadge value={count ?? 0} label="unread" className="absolute -top-2 -right-3 h-4 min-w-4 px-1 text-[10px]" />
                        </span>
                        <span className="w-full truncate">{label}</span>
                        {href === "/referrals" && <ReferNavChip className="absolute top-1.5 right-1.5" />}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          <div className="text-muted-foreground flex items-center justify-between border-t pt-4 text-xs font-medium">
            <Link href="/guidelines" prefetch={false} onClick={() => onOpenChange(false)} className="hover:text-foreground">
              Community guidelines
            </Link>
            <Link href="/changelog" prefetch={false} onClick={() => onOpenChange(false)} className="hover:text-foreground">
              What&rsquo;s new
            </Link>
          </div>
        </nav>
      </SheetContent>
    </Sheet>
  );
}

/**
 * Phone navigation: a floating glass bar with the main destinations, a post button in the middle and a More tab that opens
 * everything else. It floats clear of the home indicator through the safe-area inset (see --shell-bottom in globals.css).
 */
export function BottomNav({ items, counts = {} }) {
  const pathname = usePathname();
  const indicatorId = useId();
  const [moreOpen, setMoreOpen] = useState(false);
  const liveMessages = useLiveMessageCount(counts["/messages"]);
  const countFor = (href) => (href === "/messages" ? liveMessages : counts[href]);
  const bottom = MOBILE_BOTTOM_HREFS.map((href) => items.find((i) => i.href === href)).filter(Boolean);
  if (bottom.length < 2) return null;
  const mid = Math.ceil(bottom.length / 2);
  const left = bottom.slice(0, mid);
  const right = bottom.slice(mid);
  // A section that lives in the More sheet is open: the More tab is the one to highlight.
  const moreActive = !bottom.some((i) => isActive(pathname, i.href)) && items.some((i) => isActive(pathname, i.href));
  return (
    <nav aria-label="Quick navigation" data-shell="bottom-nav" className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:hidden">
      <ul className="bg-card/85 supports-[backdrop-filter]:bg-card/70 pointer-events-auto mx-auto grid h-16 max-w-md grid-cols-5 items-center rounded-[1.75rem] border px-1.5 shadow-[0_8px_30px_-6px_rgb(16_24_40/0.22)] backdrop-blur-xl backdrop-saturate-150">
        {left.map((item) => (
          <li key={item.href}>
            <Tab item={item} count={countFor(item.href)} active={isActive(pathname, item.href)} indicatorId={indicatorId} />
          </li>
        ))}
        <li className="grid place-items-center">
          <ComposeLink
            aria-label="Write a post"
            className="from-primary to-primary/80 text-primary-foreground focus-visible:ring-ring/40 grid size-12 place-items-center rounded-full bg-gradient-to-br shadow-[0_6px_16px_-4px_color-mix(in_srgb,var(--primary)_70%,transparent)] transition-transform duration-150 outline-none focus-visible:ring-[3px] active:scale-90"
          >
            <Plus className="size-6" strokeWidth={2.5} aria-hidden="true" />
          </ComposeLink>
        </li>
        {right.map((item) => (
          <li key={item.href}>
            <Tab item={item} count={countFor(item.href)} active={isActive(pathname, item.href)} indicatorId={indicatorId} />
          </li>
        ))}
        <li>
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            className={cn(TAB, moreActive ? "text-primary-text" : "text-muted-foreground")}
          >
            {moreActive && <Indicator id={indicatorId} />}
            <span className="relative">
              <Ellipsis className="size-6" strokeWidth={moreActive ? 2.4 : 2} aria-hidden="true" />
            </span>
            <span className="relative">More</span>
            <MoreDot />
          </button>
        </li>
      </ul>
      <MoreSheet open={moreOpen} onOpenChange={setMoreOpen} items={items} counts={counts} liveMessages={liveMessages} />
    </nav>
  );
}
