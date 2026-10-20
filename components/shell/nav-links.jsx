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
import { useLiveMessageCount } from "@/lib/chat/unread-store";
import { cn } from "@/lib/utils";

function isActive(pathname, href) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Grouped vertical navigation used by the desktop sidebar and the mobile drawer.
 * The active item is a "sticker" (bright card, ink outline, offset shadow) that slides between destinations.
 */
export function NavLinks({ items, counts = {}, onNavigate }) {
  const pathname = usePathname();
  const indicatorId = useId();
  const live = useLiveMessageCount(counts["/messages"]);
  return (
    <nav aria-label="Primary" className="space-y-6">
      {NAV_GROUPS.map((group) => {
        const groupItems = items.filter((i) => i.group === group.id);
        if (groupItems.length === 0) return null;
        return (
          <div key={group.id}>
            <p className="eyebrow mb-2 px-3">{group.label}</p>
            <ul className="space-y-1">
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
                      className={cn(
                        "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors duration-150",
                        active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {active ? (
                        <m.span
                          layoutId={indicatorId}
                          aria-hidden="true"
                          transition={EASE.spring}
                          className="border-foreground bg-card absolute inset-0 rounded-lg border shadow-[2px_2px_0_0_var(--hard)]"
                        />
                      ) : (
                        <span aria-hidden="true" className="bg-accent absolute inset-0 rounded-lg opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
                      )}
                      <NavIcon
                        name={icon}
                        className={cn("relative size-[18px] shrink-0 transition-transform duration-150 group-hover:-rotate-6", active && "text-coral-text")}
                        aria-hidden="true"
                      />
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
