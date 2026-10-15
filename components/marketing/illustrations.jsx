import { cn } from "@/lib/utils";

/**
 * The landing page's illustration set: small, flat, token-coloured SVG (no filters, no raster, a few dozen nodes each).
 * Every graphic is either decorative (aria-hidden) or carries a role="img" and a label that says what it shows.
 * They are server components: no JavaScript is shipped for them.
 */

const STROKE = "var(--foreground)";

/** Concentric orbits behind the hero. Decorative. One satellite drifts slowly (stopped for reduced motion). */
export function OrbitRings({ className }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 600 600" fill="none" className={cn("pointer-events-none", className)}>
      <circle cx="300" cy="300" r="120" stroke="var(--border-strong)" strokeWidth="1.5" />
      <circle cx="300" cy="300" r="190" stroke="var(--border-strong)" strokeWidth="1.5" strokeDasharray="3 9" />
      <circle cx="300" cy="300" r="262" stroke="var(--border)" strokeWidth="1.5" />
      <ellipse cx="300" cy="300" rx="285" ry="110" transform="rotate(-24 300 300)" stroke="var(--border-strong)" strokeWidth="1.5" strokeDasharray="2 7" />
      <circle cx="120" cy="180" r="10" fill="var(--sun)" stroke={STROKE} strokeWidth="2" />
      <circle cx="508" cy="392" r="7" fill="var(--teal)" stroke={STROKE} strokeWidth="2" />
      <g className="origin-center [animation:orbit_120s_linear_infinite]" style={{ transformOrigin: "300px 300px" }}>
        <circle cx="300" cy="38" r="8" fill="var(--coral)" stroke={STROKE} strokeWidth="2" />
      </g>
    </svg>
  );
}

/**
 * People, projects, ideas and colleges around one hub: the idea of the product in one picture. Generic shapes, no
 * names, no numbers.
 */
export function CampusGraph({ className }) {
  const nodes = [
    { x: 90, y: 70, kind: "person", fill: "var(--blue)" },
    { x: 250, y: 30, kind: "idea", fill: "var(--sun)" },
    { x: 410, y: 80, kind: "person", fill: "var(--rose)" },
    { x: 450, y: 210, kind: "project", fill: "var(--teal)" },
    { x: 380, y: 320, kind: "person", fill: "var(--plum)" },
    { x: 220, y: 335, kind: "college", fill: "var(--leaf)" },
    { x: 70, y: 280, kind: "project", fill: "var(--coral)" },
    { x: 40, y: 175, kind: "idea", fill: "var(--sun)" },
  ];
  const hub = { x: 250, y: 185 };
  const shape = (n) => {
    const p = { fill: n.fill, stroke: STROKE, strokeWidth: 2.5 };
    if (n.kind === "person")
      return (
        <g>
          <circle cx={n.x} cy={n.y - 6} r="9" {...p} />
          <path d={`M${n.x - 16} ${n.y + 18} q16 -22 32 0`} {...p} />
        </g>
      );
    if (n.kind === "project") return <rect x={n.x - 16} y={n.y - 14} width="32" height="28" rx="6" {...p} />;
    if (n.kind === "idea") return <path d={`M${n.x} ${n.y - 18} l16 18 l-16 18 l-16 -18 z`} {...p} />;
    return (
      <g>
        <path d={`M${n.x - 18} ${n.y + 14} v-18 l18 -12 l18 12 v18 z`} {...p} />
        <path d={`M${n.x - 4} ${n.y + 14} v-9 h8 v9`} stroke={STROKE} strokeWidth="2" fill="none" />
      </g>
    );
  };
  return (
    <svg
      role="img"
      aria-label="Diagram: people, projects, ideas and college communities connected around UniSphere"
      viewBox="0 0 500 370"
      fill="none"
      className={cn("h-auto w-full", className)}
    >
      <ellipse cx={hub.x} cy={hub.y} rx="205" ry="140" stroke="var(--border-strong)" strokeWidth="1.5" strokeDasharray="3 8" />
      {nodes.map((n, i) => (
        <line key={`l${i}`} x1={hub.x} y1={hub.y} x2={n.x} y2={n.y} stroke="var(--border-strong)" strokeWidth="2" strokeDasharray={i % 2 ? "2 6" : undefined} />
      ))}
      <line x1={nodes[0].x} y1={nodes[0].y} x2={nodes[1].x} y2={nodes[1].y} stroke="var(--border-strong)" strokeWidth="2" />
      <line x1={nodes[2].x} y1={nodes[2].y} x2={nodes[3].x} y2={nodes[3].y} stroke="var(--border-strong)" strokeWidth="2" />
      <line x1={nodes[5].x} y1={nodes[5].y} x2={nodes[6].x} y2={nodes[6].y} stroke="var(--border-strong)" strokeWidth="2" />
      {nodes.map((n, i) => (
        <g key={i}>{shape(n)}</g>
      ))}
      <circle cx={hub.x} cy={hub.y} r="34" fill="var(--card)" stroke={STROKE} strokeWidth="3" />
      <circle cx={hub.x} cy={hub.y} r="14" fill="var(--coral)" stroke={STROKE} strokeWidth="2.5" />
      <ellipse cx={hub.x} cy={hub.y} rx="34" ry="12" transform={`rotate(-24 ${hub.x} ${hub.y})`} stroke={STROKE} strokeWidth="2" />
    </svg>
  );
}

/** Step 1: one person, a ring that opens (anyone can join). Decorative; the step heading says it. */
export function StepJoin({ className }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 200 130" fill="none" className={cn("h-auto w-full", className)}>
      <circle cx="100" cy="65" r="52" stroke="var(--border-strong)" strokeWidth="2" strokeDasharray="3 8" />
      <circle cx="100" cy="52" r="17" fill="var(--blue)" stroke={STROKE} strokeWidth="3" />
      <path d="M66 100 q34 -42 68 0" fill="var(--blue)" stroke={STROKE} strokeWidth="3" />
      <rect x="146" y="22" width="34" height="26" rx="8" fill="var(--sun)" stroke={STROKE} strokeWidth="3" />
      <path d="M154 36 l7 7 l12 -14" stroke={STROKE} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Step 2: a post that fans out into related work. */
export function StepShare({ className }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 200 130" fill="none" className={cn("h-auto w-full", className)}>
      <rect x="14" y="40" width="74" height="50" rx="10" fill="var(--card)" stroke={STROKE} strokeWidth="3" />
      <path d="M26 58 h40 M26 70 h28" stroke={STROKE} strokeWidth="3" strokeLinecap="round" />
      <path d="M92 65 C112 65 112 30 134 30 M92 65 H134 M92 65 C112 65 112 100 134 100" stroke="var(--border-strong)" strokeWidth="2.5" strokeLinecap="round" />
      <rect x="134" y="17" width="52" height="26" rx="8" fill="var(--teal)" stroke={STROKE} strokeWidth="3" />
      <rect x="134" y="52" width="52" height="26" rx="8" fill="var(--plum)" stroke={STROKE} strokeWidth="3" />
      <rect x="134" y="87" width="52" height="26" rx="8" fill="var(--rose)" stroke={STROKE} strokeWidth="3" />
    </svg>
  );
}

/** Step 3: three people around one project. */
export function StepBuild({ className }) {
  const person = (x, y, fill) => (
    <g>
      <circle cx={x} cy={y - 5} r="9" fill={fill} stroke={STROKE} strokeWidth="3" />
      <path d={`M${x - 15} ${y + 18} q15 -22 30 0`} fill={fill} stroke={STROKE} strokeWidth="3" />
    </g>
  );
  return (
    <svg aria-hidden="true" viewBox="0 0 200 130" fill="none" className={cn("h-auto w-full", className)}>
      <path d="M58 40 L100 78 M142 40 L100 78 M100 22 V70" stroke="var(--border-strong)" strokeWidth="2.5" strokeLinecap="round" />
      <rect x="78" y="70" width="44" height="36" rx="9" fill="var(--coral)" stroke={STROKE} strokeWidth="3" />
      <path d="M90 88 h20" stroke={STROKE} strokeWidth="3" strokeLinecap="round" />
      {person(48, 40, "var(--blue)")}
      {person(152, 40, "var(--plum)")}
      {person(100, 20, "var(--sun)")}
    </svg>
  );
}
