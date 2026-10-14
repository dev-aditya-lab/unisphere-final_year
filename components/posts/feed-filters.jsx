"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { FEED_SCOPES, POST_CATEGORIES } from "@/lib/content/post-meta";
import { cn } from "@/lib/utils";

function href(pathname, params, patch) {
  const next = new URLSearchParams(params.toString());
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined || v === "") next.delete(k);
    else next.set(k, v);
  }
  const qs = next.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

/** Scope tabs + category chips. Filters live in the URL, so they are shareable and survive refresh. */
export function FeedFilters({ scope, category, hideCategories = false, hasCollege = true }) {
  const scopes = hasCollege ? FEED_SCOPES : FEED_SCOPES.filter((s) => s.value !== "college");
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <div className="space-y-3">
      <div role="tablist" aria-label="Feed" className="bg-sunken border-border inline-flex rounded-xl border p-1">
        {scopes.map((s) => (
          <Link
            key={s.value}
            role="tab"
            aria-selected={scope === s.value}
            href={href(pathname, params, { scope: s.value === "college" ? null : s.value })}
            scroll={false}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-sm font-semibold transition-[color,background-color,box-shadow] duration-150",
              scope === s.value
                ? "border-border bg-card text-foreground shadow-[0_1px_0_0_var(--border-strong),0_4px_10px_-6px_rgb(0_0_0/0.3)]"
                : "text-muted-foreground hover:text-foreground border-transparent",
            )}
          >
            {s.label}
          </Link>
        ))}
      </div>
      {!hideCategories && (
        <nav aria-label="Filter by type" className="scrollbar-none -mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
          <ul className="flex min-w-max gap-1.5">
            {[{ value: null, label: "All", tone: "tone-stone" }, ...POST_CATEGORIES].map((c) => {
              const active = (category ?? null) === c.value;
              return (
                <li key={c.value ?? "all"}>
                  <Link
                    href={href(pathname, params, { category: c.value })}
                    scroll={false}
                    aria-current={active ? "true" : undefined}
                    className={cn(
                      "press flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-semibold transition-colors duration-150",
                      c.tone,
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-muted-foreground hover:border-foreground/50 hover:text-foreground",
                    )}
                  >
                    {c.value && <span aria-hidden="true" className="tone-dot size-2 rounded-[2px]" />}
                    {c.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </div>
  );
}
