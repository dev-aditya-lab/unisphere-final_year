"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { SETTINGS_GROUPS, SETTINGS_SECTIONS, isSectionActive } from "@/lib/settings-sections";
import { cn } from "@/lib/utils";

/** Settings overview: one tappable row per area. This is the whole settings menu on a phone. */
export function SettingsHub() {
  return (
    <div className="space-y-6">
      {SETTINGS_GROUPS.map((group) => (
        <section key={group} aria-labelledby={`hub-${group}`}>
          <h2 id={`hub-${group}`} className="text-muted-foreground mb-2 px-1 text-xs font-bold tracking-wide uppercase">
            {group}
          </h2>
          <ul className="surface divide-y overflow-hidden p-0">
            {SETTINGS_SECTIONS.filter((s) => s.group === group).map((s) => (
              <li key={s.href}>
                <Link href={s.href} className="hover:bg-accent focus-visible:bg-accent flex items-center gap-3 px-4 py-3.5 transition-colors">
                  <span className="bg-primary-soft text-primary flex size-10 shrink-0 items-center justify-center rounded-lg">
                    <s.icon className="size-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{s.label}</span>
                    <span className="text-muted-foreground block text-sm leading-snug">{s.description}</span>
                  </span>
                  <ChevronRight className="text-muted-foreground size-5 shrink-0" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/**
 * Frame for every settings page.
 *  - Phone: `/settings` is the menu; a section shows a "Settings" back link and its own title, so there is never a row of
 *    tabs to scroll sideways.
 *  - Desktop: a sticky list of the sections beside the page.
 */
export function SettingsShell({ children }) {
  const pathname = usePathname();
  const current = SETTINGS_SECTIONS.find((s) => isSectionActive(pathname, s.href));

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className={cn("mb-6 text-[1.75rem] leading-[1.05] font-extrabold tracking-tight sm:text-[2.125rem]", current && "hidden lg:block")}>Settings</h1>
      {current && (
        <div className="mb-5 lg:hidden">
          <Link href="/settings" className="text-muted-foreground hover:text-foreground -ml-1 inline-flex items-center gap-1 rounded-md px-1 py-1 text-sm font-medium">
            <ArrowLeft className="size-4" aria-hidden="true" /> Settings
          </Link>
          <p className="mt-1 text-[1.75rem] leading-[1.05] font-extrabold tracking-tight" aria-hidden="true">
            {current.label}
          </p>
        </div>
      )}
      <div className="lg:grid lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-8">
        <nav aria-label="Settings" className="hidden lg:block">
          <ul className="sticky top-24 space-y-1">
            {SETTINGS_SECTIONS.map((s) => {
              const active = isSectionActive(pathname, s.href);
              return (
                <li key={s.href}>
                  <Link
                    href={s.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      active ? "bg-primary-soft text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                  >
                    <s.icon className="size-4 shrink-0" aria-hidden="true" /> {s.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="min-w-0 max-w-3xl">{children}</div>
      </div>
    </div>
  );
}
