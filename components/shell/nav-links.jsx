"use client";

import { useId } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { m } from "motion/react";
import { NAV_GROUPS, shouldPrefetch } from "@/lib/nav";
import { NavPending } from "@/components/shell/nav-pending";
import { EASE } from "@/lib/motion";
import { NavIcon } from "@/components/shell/nav-icons";
import { CountBadge } from "@/components/motion/count-badge";
import { OrbitNavMark } from "@/components/orbits/nav-bits";
import { useLiveMessageCount } from "@/lib/chat/unread-store";
import { cn } from "@/lib/utils";

function isActive(pathname, href) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Grouped vertical navigation for the desktop sidebar.
 * The active item is a soft indigo pill with a bar on its leading edge (so it is not told apart by colour alone),
 * and the pill slides between destinations.
 */
export function NavLinks({ items, counts = {}, onNavigate }) {
  const pathname = usePathname();
  const indicatorId = useId();
  const live = useLiveMessageCount(counts["/messages"]);
  return (
    <nav aria-label="Primary" className="space-y-5">
      {NAV_GROUPS.map((group) => {
        const groupItems = items.filter((i) => i.group === group.id);
        if (groupItems.length === 0) return null;
        return (
          <div key={group.id}>
            <p className="eyebrow mb-1.5 px-3">{group.label}</p>
            <ul className="space-y-0.5">
              {groupItems.map(({ href, label, icon }) => {
                const active = isActive(pathname, href);
                const count = href === "/messages" ? live : counts[href];
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      prefetch={shouldPrefetch(href) ? undefined : false}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      title={href === "/orbits" ? "Orbits: earn rewards, keep your streak, answer the daily challenge" : undefined}
                      className={cn(
                        "group relative flex h-9 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors duration-150",
                        active ? "text-primary-text font-semibold" : "text-muted-foreground hover:text-foreground",
                        href === "/orbits" && !active && "text-primary-text/90 hover:shadow-[inset_0_0_0_1px_var(--orbit-line),0_4px_14px_-8px_color-mix(in_srgb,var(--primary)_55%,transparent)]",
                      )}
                    >
                      {active ? (
                        <m.span layoutId={indicatorId} aria-hidden="true" transition={EASE.spring} className="bg-primary-soft absolute inset-0 rounded-lg">
                          <span className="bg-primary absolute top-2 bottom-2 left-0 w-[3px] rounded-full" />
                        </m.span>
                      ) : (
                        <span aria-hidden="true" className="bg-accent absolute inset-0 rounded-lg opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
                      )}
                      {href === "/orbits" ? <span className="relative"><OrbitNavMark size={28} /></span> : <NavIcon name={icon} className="relative size-[18px] shrink-0" aria-hidden="true" />}
                      <span className="relative flex-1 truncate">{label}</span>
                      <CountBadge value={count ?? 0} label="unread" className="relative" />
                      <NavPending className="relative" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
