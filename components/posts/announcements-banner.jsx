"use client";

import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Megaphone, Pin } from "@/components/icons/lucide-compat";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

/** One announcement as a single line that opens to its full text (the height eases open with a grid-row transition, no layout script). */
function Announcement({ a }) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  return (
    <article className="border-primary/20 bg-primary-soft overflow-hidden rounded-2xl border">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((o) => !o)}
        className="focus-visible:ring-ring/40 flex min-h-12 w-full items-center gap-3 px-3.5 py-2.5 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-inset"
      >
        <span className="bg-primary text-primary-foreground grid size-8 shrink-0 place-items-center rounded-full">
          <Megaphone className="size-4" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="text-primary-text flex items-center gap-1.5 text-[11px] font-bold tracking-wide uppercase">
            Official announcement
            {a.pinned && (
              <span className="inline-flex items-center gap-0.5 normal-case">
                <Pin className="size-3" aria-hidden="true" /> Pinned
              </span>
            )}
          </span>
          <span className={cn("font-heading block text-sm font-bold", !open && "truncate")}>{a.title}</span>
        </span>
        <time dateTime={a.published_at} suppressHydrationWarning className="text-muted-foreground hidden shrink-0 text-xs sm:block">
          {timeAgo(a.published_at)}
        </time>
        <ChevronDown className={cn("text-muted-foreground size-4 shrink-0 transition-transform duration-200", open && "rotate-180")} aria-hidden="true" />
      </button>
      <div id={bodyId} className={cn("grid transition-[grid-template-rows] duration-200 ease-out", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
        <div className="min-h-0 overflow-hidden" inert={open ? undefined : true}>
          <p className="px-3.5 pb-3.5 pl-[3.625rem] text-sm whitespace-pre-wrap">{a.body}</p>
        </div>
      </div>
    </article>
  );
}

/**
 * Official college announcements. Visually separate from member posts so nobody mistakes one for the other, and kept to one
 * quiet line each (the newest only; the rest are one tap away) so they never push the posts down the page.
 */
export function AnnouncementsBanner({ items }) {
  const [all, setAll] = useState(false);
  if (!items?.length) return null;
  const shown = all ? items : items.slice(0, 1);
  return (
    <section aria-label="Official announcements" className="space-y-2">
      {shown.map((a) => (
        <Announcement key={a.id} a={a} />
      ))}
      {items.length > 1 && (
        <button type="button" onClick={() => setAll((v) => !v)} aria-expanded={all} className="text-primary-text hover:bg-primary-soft focus-visible:ring-ring/40 -mt-0.5 ml-1 min-h-8 rounded-full px-2.5 text-xs font-semibold outline-none focus-visible:ring-[3px]">
          {all ? "Show fewer" : `${items.length - 1} more announcement${items.length - 1 === 1 ? "" : "s"}`}
        </button>
      )}
    </section>
  );
}
