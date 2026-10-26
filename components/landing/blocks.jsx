import { cn } from "@/lib/utils";

/**
 * The small label above a section: the section number in the accent (or a dot, for "—"), then its name. The visible name is
 * decorative (aria-hidden) and is the one sheryjs animates letter by letter on large screens; an identical visually hidden copy is
 * what assistive technology reads, so the page is never read out one character at a time.
 */
export function Kicker({ number, children, className }) {
  return (
    <p className={cn("kicker", className)}>
      {number === "—" ? <span aria-hidden="true" className="kicker-dot" /> : <span className="kicker-num">{number}</span>}
      <span aria-hidden="true" className="sh-text">
        {children}
      </span>
      <span className="sr-only">{children}</span>
    </p>
  );
}
