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

const TAB = "relative flex h-full w-full flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition-colors outline-none focus-visible:bg-accent";

function Indicator({ id }) {
  return <m.span layoutId={id} aria-hidden="true" transition={EASE.spring} className="bg-primary absolute top-0 h-[3px] w-8 rounded-b-full" />;
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
        <NavIcon name={icon} active={active} size={26} />
        <CountBadge value={count ?? 0} label="unread" className="absolute -top-2 -right-3 h-4 min-w-4 px-1 text-[10px]" />
      </span>
      {label}
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
      <SheetContent side="bottom" className="max-h-[85dvh] gap-0 overflow-y-auto rounded-t-2xl p-0">
        <SheetHeader className="px-4 pt-4 pb-2 text-left">
          <SheetTitle className="text-base">More</SheetTitle>
          <SheetDescription className="sr-only">All sections of UniSphere</SheetDescription>
        </SheetHeader>
        <nav aria-label="All sections" className="space-y-5 px-4 pt-2 pb-5">
          {items.some((i) => i.href === "/orbits") && <OrbitMoreCard onNavigate={() => onOpenChange(false)} />}
          {groups.map((group) => (
            <div key={group.id}>
              <p className="eyebrow mb-2">{group.label}</p>
              <ul className="grid grid-cols-3 gap-2">
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
                          "relative flex min-h-[4.5rem] flex-col items-center justify-center gap-1.5 rounded-xl border px-1 py-2 text-center text-xs font-semibold transition-colors",
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
 * Phone navigation: three destinations, a post button in the middle (in the bar, not floating over the feed) and a
 * More tab that opens everything else. Clear of the home indicator through the safe-area inset.
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
    <nav
      aria-label="Quick navigation"
      className="bg-card/95 supports-[backdrop-filter]:bg-card/85 pl-safe pr-safe fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur-md lg:hidden"
    >
      <div className="pb-safe">
        <ul className="mx-auto grid h-14 max-w-lg grid-cols-5 items-stretch">
          {left.map((item) => (
            <li key={item.href}>
              <Tab item={item} count={countFor(item.href)} active={isActive(pathname, item.href)} indicatorId={indicatorId} />
            </li>
          ))}
          <li className="grid place-items-center">
            <ComposeLink
              aria-label="Write a post"
              className="bg-primary text-primary-foreground focus-visible:ring-ring/40 grid h-9 w-12 place-items-center rounded-xl shadow-xs transition-transform duration-150 outline-none focus-visible:ring-[3px] active:scale-95"
            >
              <Plus className="size-5" strokeWidth={2.5} aria-hidden="true" />
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
                <Ellipsis className="size-[22px]" strokeWidth={moreActive ? 2.4 : 2} aria-hidden="true" />
              </span>
              <MoreDot />
              More
            </button>
          </li>
        </ul>
      </div>
      <MoreSheet open={moreOpen} onOpenChange={setMoreOpen} items={items} counts={counts} liveMessages={liveMessages} />
    </nav>
  );
}
