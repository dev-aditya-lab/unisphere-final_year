import { cn } from "@/lib/utils";

/**
 * A pending state: three small beads in the current text colour rising in turn. It replaces a spinning glyph inside buttons and
 * inline "working" labels. Decorative (the control says "busy" itself, e.g. aria-busy), transform and opacity only, and still
 * under reduced motion.
 */
export function Beads({ className }) {
  return (
    <span aria-hidden="true" className={cn("ui-beads", className)}>
      <i /><i /><i />
    </span>
  );
}
