"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_GROUPS } from "@/lib/nav";
import { NavIcon } from "@/components/shell/nav-icons";
import { cn } from "@/lib/utils";

function isActive(pathname, href) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Grouped vertical navigation used by the desktop sidebar and the mobile drawer. */
export function NavLinks({ items, counts = {}, onNavigate }) {
  const pathname = usePathname();
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
                const count = counts[href];
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                        active
                          ? "bg-accent text-accent-foreground"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      {active && <span aria-hidden="true" className="bg-primary absolute inset-y-1.5 left-0 w-0.5 rounded-full" />}
                      <NavIcon name={icon} className="size-[18px] shrink-0" aria-hidden="true" />
                      <span className="flex-1 truncate">{label}</span>
                      {count > 0 && (
                        <span className="bg-primary text-primary-foreground min-w-5 rounded-full px-1.5 text-center text-[11px] leading-5 font-semibold">
                          {count > 99 ? "99+" : count}
                          <span className="sr-only"> unread</span>
                        </span>
                      )}
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
