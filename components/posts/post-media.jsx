"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { frameRatio } from "@/lib/images/frame";
import { privateFileUrl } from "@/lib/media";
import { cn } from "@/lib/utils";

// A single picture is drawn in the frame that fits it (lib/images/frame.js); several pictures share a fixed grid. The frame is
// known before the image loads (the upload records its size), so nothing shifts while it loads, and no picture can make the
// card taller than 75% of the screen. The full picture is one tap away in the lightbox.
const GRID = {
  2: "aspect-[16/9] grid-cols-2",
  3: "aspect-[16/10] grid-cols-2 grid-rows-2",
  4: "aspect-[16/10] grid-cols-2 grid-rows-2",
};

function Lightbox({ items, index, onIndexChange, onClose }) {
  const count = items.length;
  const current = items[index];
  const go = (delta) => onIndexChange((index + delta + count) % count);
  const nav = "absolute top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white transition-colors hover:bg-black/75 focus-visible:ring-[3px] focus-visible:ring-white/70 focus-visible:outline-none";
  return (
    <DialogPrimitive.Root open onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-black/90 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onKeyDown={(e) => {
            if (count < 2) return;
            if (e.key === "ArrowLeft") go(-1);
            if (e.key === "ArrowRight") go(1);
          }}
          className="pt-safe pb-safe fixed inset-0 z-[60] flex items-center justify-center outline-none"
        >
          <DialogPrimitive.Title className="sr-only">
            {current.alt || "Image attached to post"} ({index + 1} of {count})
          </DialogPrimitive.Title>
          <DialogPrimitive.Close
            aria-label="Close image viewer"
            className="absolute top-3 right-3 z-10 grid size-11 place-items-center rounded-full bg-black/55 text-white transition-colors hover:bg-black/75 focus-visible:ring-[3px] focus-visible:ring-white/70 focus-visible:outline-none"
          >
            <X className="size-5" aria-hidden="true" />
          </DialogPrimitive.Close>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={privateFileUrl(current.id)} alt={current.alt || "Image attached to post"} className="max-h-[calc(100dvh-5rem)] max-w-[calc(100vw-1.5rem)] object-contain" />
          {count > 1 && (
            <>
              <button type="button" onClick={() => go(-1)} aria-label="Previous image" className={cn(nav, "left-3")}>
                <ChevronLeft className="size-5" aria-hidden="true" />
              </button>
              <button type="button" onClick={() => go(1)} aria-label="Next image" className={cn(nav, "right-3")}>
                <ChevronRight className="size-5" aria-hidden="true" />
              </button>
              <p aria-hidden="true" className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-3 py-1 text-xs font-medium text-white tabular-nums">
                {index + 1} / {count}
              </p>
            </>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Up to four attached images; selecting one opens it full size. */
export function PostMedia({ items, className }) {
  const [open, setOpen] = useState(null);
  // Sizes measured in the browser, for images stored before their size was recorded.
  const [measured, setMeasured] = useState({});
  const shown = items?.slice(0, 4) ?? [];
  if (shown.length === 0) return null;
  // Read the size now: React clears the event's currentTarget before a state updater would run.
  const measure = (id, img) => {
    const width = img.naturalWidth;
    const height = img.naturalHeight;
    if (width > 0 && height > 0) setMeasured((m) => (m[id] ? m : { ...m, [id]: { width, height } }));
  };
  const single = shown.length === 1;
  const only = shown[0];
  const size = single ? (only.width && only.height ? { width: only.width, height: only.height } : measured[only.id]) : null;

  return (
    <>
      <ul
        style={single ? { aspectRatio: frameRatio(size?.width, size?.height) } : undefined}
        className={cn("bg-muted ring-border grid gap-0.5 overflow-hidden rounded-xl ring-1 ring-inset", single ? "max-h-[75dvh] grid-cols-1" : GRID[shown.length], className)}
      >
        {shown.map((a, i) => (
          <li key={a.id} className={cn("relative min-h-0 min-w-0 overflow-hidden", shown.length === 3 && i === 0 && "row-span-2")}>
            <button
              type="button"
              onClick={() => setOpen(i)}
              aria-label={`View image ${i + 1} of ${shown.length} full size`}
              className="focus-visible:ring-ring/60 absolute inset-0 block size-full cursor-zoom-in outline-none focus-visible:ring-[3px] focus-visible:ring-inset"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={privateFileUrl(a.id)}
                alt={a.alt || "Image attached to post"}
                loading="lazy"
                decoding="async"
                draggable={false}
                onLoad={single && !(a.width && a.height) ? (e) => measure(a.id, e.currentTarget) : undefined}
                className="size-full object-cover"
              />
            </button>
          </li>
        ))}
      </ul>
      {open !== null && <Lightbox items={shown} index={open} onIndexChange={setOpen} onClose={() => setOpen(null)} />}
    </>
  );
}
