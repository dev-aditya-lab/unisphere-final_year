"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, ChartColumn, IndianRupee, Inbox, KeyRound, LayoutDashboard, Megaphone, Orbit, Rocket, Scale, ScrollText, SlidersHorizontal, Tags, UserX } from "@/components/icons/lucide-compat";
import { BadgeCheck, BellRing, CalendarDays, FileText, Flag, GraduationCap, Gift, Landmark, Trophy, MessageSquareHeart, ShieldAlert, ShieldCheck, Sparkles, Users, UsersRound } from "@/components/icons/lucide-compat";
import { ADMIN_GROUPS } from "@/lib/admin/nav";
import { cn } from "@/lib/utils";

const ICONS = { BadgeCheck, GraduationCap, Trophy, ShieldAlert, BellRing, BookOpen, CalendarDays, ChartColumn, FileText, Flag, Gift, IndianRupee, ShieldCheck, Inbox, KeyRound, Landmark, LayoutDashboard, Megaphone, MessageSquareHeart, Orbit, Rocket, Scale, ScrollText, SlidersHorizontal, Sparkles, Tags, UserX, Users, UsersRound };

/** Grouped admin navigation (sidebar and mobile drawer). `counts` maps a count key to a waiting-item number. */
export function AdminNav({ items, counts = {}, onNavigate }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin" className="space-y-5">
      {ADMIN_GROUPS.map((group) => {
        const groupItems = items.filter((i) => i.group === group.id);
        if (groupItems.length === 0) return null;
        return (
          <div key={group.id}>
            <p className="eyebrow mb-1.5 px-3">{group.label}</p>
            <ul className="space-y-0.5">
              {groupItems.map(({ href, label, icon, exact, count }) => {
                const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
                const Icon = ICONS[icon] ?? LayoutDashboard;
                const waiting = count ? (counts[count] ?? 0) : 0;
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                        active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      {active && <span aria-hidden="true" className="bg-primary absolute inset-y-1.5 left-0 w-0.5 rounded-full" />}
                      <Icon className="size-[18px] shrink-0" aria-hidden="true" />
                      <span className="flex-1 truncate">{label}</span>
                      {waiting > 0 && (
                        <span className="bg-primary text-primary-foreground min-w-5 rounded-full px-1.5 text-center text-[11px] leading-5 font-semibold">
                          {waiting > 99 ? "99+" : waiting}
                          <span className="sr-only"> waiting</span>
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
