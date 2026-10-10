import { cn } from "@/lib/utils";

/**
 * A slow, endless strip of short phrases. Pure CSS (a transform loop), duplicated once for a seamless wrap; the
 * copy is hidden from assistive tech and the loop stops for members who prefer reduced motion.
 */
export function Marquee({ items, className }) {
  const row = (hidden) => (
    <ul aria-hidden={hidden || undefined} className="flex shrink-0 items-center gap-8 pr-8">
      {items.map((t) => (
        <li key={t} className="font-heading flex items-center gap-8 text-xl font-extrabold tracking-tight whitespace-nowrap sm:text-2xl">
          {t}
          <span aria-hidden="true" className="bg-accent-hot size-2.5 rotate-45 rounded-[2px]" />
        </li>
      ))}
    </ul>
  );
  return (
    <div className={cn("overflow-hidden border-y py-4", className)}>
      <div className="flex w-max [animation:marquee_46s_linear_infinite] hover:[animation-play-state:paused]">
        {row(false)}
        {row(true)}
      </div>
    </div>
  );
}
