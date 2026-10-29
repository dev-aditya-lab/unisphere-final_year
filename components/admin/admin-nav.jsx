"use client";

import { useMemo, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { adminIcon } from "@/components/admin/admin-icons";
import { ADMIN_GROUPS } from "@/lib/admin/nav";
import { cn } from "@/lib/utils";

const STORE_KEY = "admin-nav-groups";

const isActive = (pathname, { href, exact }) => (exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));

const listeners = new Set();
const subscribe = (fn) => {
  listeners.add(fn);
  window.addEventListener("storage", fn);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", fn);
  };
};
// A raw string snapshot is a stable primitive, so React only re-renders when the saved choices really change.
const readRaw = () => {
  try {
    return localStorage.getItem(STORE_KEY) ?? "";
  } catch {
    return "";
  }
};

function Count({ value, className }) {
  if (!(value > 0)) return null;
  return (
    <span className={cn("bg-primary text-primary-foreground min-w-5 rounded-full px-1.5 text-center text-[11px] leading-5 font-semibold tabular-nums", className)}>
      {value > 99 ? "99+" : value}
      <span className="sr-only"> waiting</span>
    </span>
  );
}

/**
 * Grouped admin navigation (sidebar and mobile drawer). `counts` maps a count key to a waiting-item number.
 * Groups fold away so a long menu stays scannable: the group you are in is always open, the review queues start open,
 * and a folded group still shows how many items are waiting inside it. Choices are remembered in this browser only.
 */
export function AdminNav({ items, counts = {}, onNavigate }) {
  const pathname = usePathname();
  const raw = useSyncExternalStore(subscribe, readRaw, () => "");
  const stored = useMemo(() => {
    try {
      const parsed = JSON.parse(raw || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }, [raw]);

  const toggle = (id, next) => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ ...stored, [id]: next }));
    } catch {
      // storage can be blocked; the menu still works for this visit
    }
    listeners.forEach((fn) => fn());
  };

  return (
    <nav aria-label="Admin" className="space-y-1">
      {ADMIN_GROUPS.map((group) => {
        const groupItems = items.filter((i) => i.group === group.id);
        if (groupItems.length === 0) return null;
        const hasActive = groupItems.some((i) => isActive(pathname, i));
        const groupWaiting = groupItems.reduce((sum, i) => sum + (i.count ? (counts[i.count] ?? 0) : 0), 0);
        const open = hasActive || (stored[group.id] ?? group.id === "review");
        const GroupIcon = adminIcon(group.icon);
        const listId = `admin-nav-${group.id}`;
        return (
          <div key={group.id}>
            <button
              type="button"
              aria-expanded={open}
              aria-controls={listId}
              disabled={hasActive}
              onClick={() => toggle(group.id, !open)}
              className="text-muted-foreground hover:bg-muted hover:text-foreground flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left transition-colors disabled:cursor-default disabled:hover:bg-transparent"
            >
              <GroupIcon className="size-4 shrink-0 opacity-70" aria-hidden="true" />
              <span className="eyebrow flex-1 !text-[11px]">{group.label}</span>
              {!open && <Count value={groupWaiting} />}
              <ChevronDown aria-hidden="true" className={cn("size-3.5 shrink-0 transition-transform", !open && "-rotate-90", hasActive && "opacity-30")} />
            </button>
            {open && (
              <ul id={listId} className="border-border/70 mt-0.5 mb-2 ml-5 space-y-0.5 border-l pl-2">
                {groupItems.map((item) => {
                  const { href, label, icon, count } = item;
                  const active = isActive(pathname, item);
                  const Icon = adminIcon(icon);
                  const waiting = count ? (counts[count] ?? 0) : 0;
                  return (
                    <li key={href}>
                      <Link
                        href={href}
                        onClick={onNavigate}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13.5px] font-medium transition-colors",
                          active ? "bg-primary-soft text-primary-text font-semibold" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                        )}
                      >
                        <Icon className="size-4 shrink-0" aria-hidden="true" />
                        <span className="flex-1 truncate">{label}</span>
                        <Count value={waiting} />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </nav>
  );
}
