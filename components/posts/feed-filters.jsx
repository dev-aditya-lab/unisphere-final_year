"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Compass, Globe, GraduationCap, Users } from "lucide-react";
import { CategoryIcon } from "@/components/posts/category-icons";
import { FEED_SCOPES, POST_CATEGORIES } from "@/lib/content/post-meta";
import { cn } from "@/lib/utils";

const SCOPE_ICON = { for_you: Compass, college: GraduationCap, following: Users, public: Globe };

function href(pathname, params, patch) {
  const next = new URLSearchParams(params.toString());
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined || v === "") next.delete(k);
    else next.set(k, v);
  }
  const qs = next.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

/** Tracks whether a horizontally scrolling element has more to reveal on either side. */
function useScrollEdges(ref) {
  const [edges, setEdges] = useState({ start: false, end: false });
  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const start = el.scrollLeft > 4;
    const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
    setEdges((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
  }, [ref]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    ro?.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro?.disconnect();
    };
  }, [ref, update]);
  return edges;
}

/**
 * Two separate controls, so they never read as one row of tabs:
 *   - the audience (my college / following / all members) is a segmented control, a choice about *whose* posts;
 *   - the type is a row of icon chips, a choice about *what kind* of posts, scrollable on narrow screens with a fade
 *     on the side that has more.
 * Both live in the URL, so they are shareable, survive a refresh and always match the posts shown.
 */
export function FeedFilters({ scope, category, hideCategories = false, hasCollege = true, includeForYou = false, defaultScope = "college", actions = null }) {
  const scopes = FEED_SCOPES.filter((s) => (includeForYou || s.value !== "for_you") && (hasCollege || s.value !== "college"));
  const pathname = usePathname();
  const params = useSearchParams();
  const scroller = useRef(null);
  const edges = useScrollEdges(scroller);

  // Bring the selected chip into view (inside the strip only: the page itself must not jump).
  useEffect(() => {
    const el = scroller.current;
    const active = el?.querySelector("[aria-current='true']");
    if (!el || !active) return;
    const left = active.offsetLeft - (el.clientWidth - active.offsetWidth) / 2;
    el.scrollTo({ left: Math.max(0, left), behavior: "auto" });
  }, [category]);

  function scrollBy(direction) {
    scroller.current?.scrollBy({ left: direction * scroller.current.clientWidth * 0.7, behavior: "smooth" });
  }

  // Arrow keys move between chips, like a toolbar; Tab still reaches every one of them.
  function onKeyDown(e) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "Home" && e.key !== "End") return;
    const links = Array.from(scroller.current?.querySelectorAll("a") ?? []);
    const i = links.indexOf(document.activeElement);
    if (i === -1) return;
    e.preventDefault();
    const next = e.key === "Home" ? 0 : e.key === "End" ? links.length - 1 : (i + (e.key === "ArrowRight" ? 1 : -1) + links.length) % links.length;
    links[next].focus();
    links[next].scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
      <nav aria-label="Whose posts" className="bg-muted flex w-full rounded-xl p-1 sm:inline-flex sm:w-auto">
        {scopes.map((s) => {
          const Icon = SCOPE_ICON[s.value];
          const active = scope === s.value;
          return (
            <Link
              key={s.value}
              href={href(pathname, params, { scope: s.value === defaultScope ? null : s.value })}
              scroll={false}
              aria-current={active ? "true" : undefined}
              className={cn(
                "flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 text-[13px] font-semibold whitespace-nowrap transition-[color,background-color,box-shadow] duration-150 sm:flex-none sm:px-3",
                active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {Icon && <Icon className="size-3.5 shrink-0 max-[380px]:hidden" aria-hidden="true" />}
              {s.label}
            </Link>
          );
        })}
      </nav>
      {actions}
      </div>

      {!hideCategories && (
        <div className="relative -mx-3 sm:mx-0">
          <nav
            ref={scroller}
            aria-label="Filter by type"
            onKeyDown={onKeyDown}
            className="scrollbar-none overflow-x-auto overscroll-x-contain px-3 py-1 sm:px-0.5"
          >
            <ul className="flex w-max gap-2">
              {[{ value: null, label: "All" }, ...POST_CATEGORIES].map((c) => {
                const active = (category ?? null) === c.value;
                return (
                  <li key={c.value ?? "all"}>
                    <Link
                      href={href(pathname, params, { category: c.value })}
                      scroll={false}
                      aria-current={active ? "true" : undefined}
                      className={cn(
                        "press flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-semibold whitespace-nowrap transition-colors duration-150",
                        active
                          ? "border-primary/30 bg-primary-soft text-primary-text"
                          : "bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
                      )}
                    >
                      <CategoryIcon value={c.value} className="size-4 shrink-0" aria-hidden="true" />
                      {c.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          {/* Fades show there is more; from sm up a button scrolls it (keys and touch already can, so these stay out of the tab order). */}
          <div
            aria-hidden="true"
            className={cn("from-background pointer-events-none absolute inset-y-0 left-0 flex w-14 items-center bg-linear-to-r from-60% to-transparent transition-opacity", edges.start ? "opacity-100" : "opacity-0")}
          >
            <button type="button" tabIndex={-1} onClick={() => scrollBy(-1)} className={cn("bg-card grid size-7 place-items-center rounded-full border shadow-sm max-sm:hidden", edges.start && "pointer-events-auto")}>
              <ChevronLeft className="size-4" />
            </button>
          </div>
          <div
            aria-hidden="true"
            className={cn("from-background pointer-events-none absolute inset-y-0 right-0 flex w-14 items-center justify-end bg-linear-to-l from-60% to-transparent transition-opacity", edges.end ? "opacity-100" : "opacity-0")}
          >
            <button type="button" tabIndex={-1} onClick={() => scrollBy(1)} className={cn("bg-card grid size-7 place-items-center rounded-full border shadow-sm max-sm:hidden", edges.end && "pointer-events-auto")}>
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
