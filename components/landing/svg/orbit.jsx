import { cn } from "@/lib/utils";

const about = { transformBox: "view-box", transformOrigin: "300px 300px" };

/**
 * Concentric rings for the closing band: hairlines that draw themselves in once, with two signal satellites on slow orbits and
 * a pulse at the centre. Decorative, drawn in the band's own light-on-dark colours, and still for reduced motion.
 */
export function Orbit({ className }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 600 600" fill="none" data-draw="once" className={cn("pointer-events-none text-band-foreground", className)}>
      <circle data-path cx="300" cy="300" r="96" stroke="currentColor" strokeOpacity="0.28" strokeWidth="1.5" />
      <circle data-path cx="300" cy="300" r="170" stroke="currentColor" strokeOpacity="0.2" strokeWidth="1.5" />
      <circle data-path cx="300" cy="300" r="244" stroke="currentColor" strokeOpacity="0.14" strokeWidth="1.5" />
      <circle data-path cx="300" cy="300" r="290" stroke="currentColor" strokeOpacity="0.1" strokeWidth="1.5" />
      <g className="spin-slow" style={about}>
        <circle cx="300" cy="130" r="7" fill="var(--band-accent)" />
      </g>
      <g className="spin-slow-rev" style={about}>
        <circle cx="544" cy="300" r="5" fill="var(--band-accent)" fillOpacity="0.8" />
      </g>
      <circle cx="300" cy="300" r="7" fill="var(--band-accent)" />
      <circle className="pulse-ring" cx="300" cy="300" r="12" stroke="var(--band-accent)" strokeWidth="1.5" style={{ "--d": 0 }} />
      <circle className="pulse-ring" cx="300" cy="300" r="12" stroke="var(--band-accent)" strokeWidth="1.5" style={{ "--d": 1600 }} />
    </svg>
  );
}
