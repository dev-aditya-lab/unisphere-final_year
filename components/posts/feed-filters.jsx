"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { m } from "motion/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Compass, Globe, GraduationCap, Users } from "@/components/icons/lucide-compat";
import { CategoryIcon } from "@/components/posts/category-icons";
import { useScrollState } from "@/hooks/use-scroll-state";
import { CATEGORY_BY_VALUE, FEED_SCOPES, POST_CATEGORIES } from "@/lib/content/post-meta";
import { EASE } from "@/lib/motion";
import { cn } from "@/lib/utils";

const SCOPE_ICON = { for_you: Compass, college: GraduationCap, following: Users, public: Globe };
// On a phone four tabs share one row, so the longer names are shortened (the full name is still what a screen reader hears).
const SCOPE_SHORT = { for_you: "For you", college: "College", following: "Following", public: "Everyone" };

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
 * Two controls, each answering one question, so they never read as one row of tabs:
 *   - the audience ("For you", my college, following, everyone) is the tab bar. It is sticky under the app bar, the
 *     selected tab has an ink bar that slides to the next one, and on a phone it slides away while scrolling down and returns
 *     the moment the member scrolls up. The tab answers the tap at once (before the server has replied);
 *   - the type of post is a row of chips below it, scrollable on narrow screens with a fade on the side that has more.
 * Both live in the URL, so they are shareable, survive a refresh and always match the posts shown.
 */
export function FeedFilters({ scope, category, hideCategories = false, hasCollege = true, includeForYou = false, defaultScope = "college", actions = null }) {
  const scopes = FEED_SCOPES.filter((s) => (includeForYou || s.value !== "for_you") && (hasCollege || s.value !== "college"));
  const pathname = usePathname();
  const params = useSearchParams();
  const scroller = useRef(null);
  const edges = useScrollEdges(scroller);
  const { scrolled, hidden } = useScrollState();
  const barId = useId();

  // What the member just chose shows at once; it is ignored as soon as the server's answer (the `scope`/`category` props) moves on.
  const [pickedScope, setPickedScope] = useState(null);
  const [pickedCategory, setPickedCategory] = useState(null);
  const activeScope = pickedScope && pickedScope.base === scope ? pickedScope.value : scope;
  const activeCategory = pickedCategory && pickedCategory.base === (category ?? null) ? pickedCategory.value : (category ?? null);

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

  // A fragment, not a wrapper: a sticky bar only sticks within its parent, which must be the whole feed column.
  return (
    <>
      {/* Sticky under the app bar (which is 3.5rem plus the notch). A focus inside it brings it back, so a keyboard user never loses it. */}
      <div
        data-hidden={hidden ? "true" : undefined}
        className={cn(
          "bg-background/90 supports-[backdrop-filter]:bg-background/75 sticky top-[calc(3.5rem+env(safe-area-inset-top)+1px)] z-10 -mx-3 border-b px-3 backdrop-blur-md transition-[transform,border-color] duration-200 ease-out sm:mx-0 sm:px-0",
          scrolled ? "border-border" : "border-transparent",
          "max-sm:data-[hidden=true]:-translate-y-[calc(100%+0.5rem)] max-sm:data-[hidden=true]:focus-within:translate-y-0",
        )}
      >
        <div className="flex items-center gap-1">
          <nav aria-label="Whose posts" className="flex min-w-0 flex-1 sm:flex-none">
            {scopes.map((s) => {
              const Icon = SCOPE_ICON[s.value];
              const active = activeScope === s.value;
              return (
                <Link
                  key={s.value}
                  href={href(pathname, params, { scope: s.value === defaultScope ? null : s.value })}
                  scroll={false}
                  onClick={() => setPickedScope({ base: scope, value: s.value })}
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "tap relative flex h-11 flex-1 items-center justify-center gap-1.5 rounded-lg px-1 text-[13px] font-semibold whitespace-nowrap outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 sm:flex-none sm:px-4",
                    active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {/* In a wrapper: the icon's own stylesheet sets its display, which a utility class on the icon cannot override. */}
                  {Icon && (
                    <span className="max-sm:hidden" aria-hidden="true">
                      <Icon className="size-4 shrink-0" />
                    </span>
                  )}
                  <span className="sm:hidden" aria-hidden="true">
                    {SCOPE_SHORT[s.value] ?? s.label}
                  </span>
                  <span className="max-sm:sr-only">{s.label}</span>
                  {active && <m.span layoutId={`${barId}-scope`} aria-hidden="true" transition={EASE.spring} className="bg-primary absolute inset-x-2 -bottom-px h-[3px] rounded-full sm:inset-x-3" />}
                </Link>
              );
            })}
          </nav>
          {actions && <div className="ml-auto shrink-0">{actions}</div>}
        </div>
      </div>

      {!hideCategories && (
        <div className="relative -mx-3 -mt-1.5 sm:mx-0">
          <nav ref={scroller} aria-label="Filter by type" onKeyDown={onKeyDown} className="scrollbar-none overflow-x-auto overscroll-x-contain px-3 py-1 sm:px-0.5">
            <ul className="flex w-max gap-1.5">
              {[{ value: null, label: "All" }, ...POST_CATEGORIES].map((c) => {
                const active = activeCategory === c.value;
                const tone = c.value ? CATEGORY_BY_VALUE[c.value]?.tone : null;
                return (
                  <li key={c.value ?? "all"}>
                    <Link
                      href={href(pathname, params, { category: c.value })}
                      scroll={false}
                      onClick={() => setPickedCategory({ base: category ?? null, value: c.value })}
                      aria-current={active ? "true" : undefined}
                      className={cn(
                        "tap flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold whitespace-nowrap outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40",
                        tone,
                        active ? "bg-foreground text-background" : "bg-muted/80 text-muted-foreground hover:bg-accent hover:text-foreground",
                      )}
                    >
                      <CategoryIcon value={c.value} className={cn("size-4 shrink-0", !active && tone && "text-(--tone-text)")} aria-hidden="true" />
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
    </>
  );
}
