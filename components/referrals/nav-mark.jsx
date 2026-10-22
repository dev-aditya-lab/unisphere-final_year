import { NavIcon } from "@/components/shell/nav-icons";
import { cn } from "@/lib/utils";

/**
 * The Refer & Earn icon in the navigation: the gift hops every few seconds and a soft ring breathes behind it, so the entry
 * draws the eye without shouting. Both loops are transform/opacity only (see `.ref-nav-*` in globals.css) and stop for people
 * who prefer reduced motion.
 */
export function ReferNavMark({ size = 22, active = false, className }) {
  return (
    <span className={cn("relative inline-grid shrink-0 place-items-center", className)} style={{ width: size, height: size }}>
      <span aria-hidden="true" className="ref-nav-glow bg-primary/35 absolute -inset-1 rounded-full" />
      <span className="ref-nav-hop relative">
        <NavIcon name="Gift" active={active} size={size} />
      </span>
    </span>
  );
}

/** A small "+100" chip beside the label. Decorative: the reward is stated in words on the page itself. */
export function ReferNavChip({ className }) {
  return (
    <span aria-hidden="true" className={cn("ref-nav-chip rounded-full bg-gradient-to-r from-amber-300 to-amber-500 px-1.5 text-[10px] leading-4 font-extrabold text-amber-950", className)}>
      +100
    </span>
  );
}
