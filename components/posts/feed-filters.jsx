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
export function FeedFilters({ scope, category, hideCategories = false }) {
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <div className="space-y-3">
      <div role="tablist" aria-label="Feed" className="bg-muted inline-flex rounded-lg p-0.5">
        {FEED_SCOPES.map((s) => (
          <Link
            key={s.value}
            role="tab"
            aria-selected={scope === s.value}
            href={href(pathname, params, { scope: s.value === "college" ? null : s.value })}
            scroll={false}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              scope === s.value ? "bg-card text-foreground border shadow-none" : "text-muted-foreground hover:text-foreground border border-transparent",
            )}
          >
            {s.label}
          </Link>
        ))}
      </div>
      {!hideCategories && (
      <nav aria-label="Filter by type" className="-mx-1 overflow-x-auto pb-1">
        <ul className="flex min-w-max gap-1.5 px-1">
          {[{ value: null, label: "All" }, ...POST_CATEGORIES].map((c) => {
            const active = (category ?? null) === c.value;
            return (
              <li key={c.value ?? "all"}>
                <Link
                  href={href(pathname, params, { category: c.value })}
                  scroll={false}
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "block rounded-full border px-3 py-1 text-[13px] font-medium transition-colors",
                    active ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:border-foreground/30",
                  )}
                >
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
