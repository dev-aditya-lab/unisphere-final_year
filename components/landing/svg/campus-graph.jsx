import { cn } from "@/lib/utils";

const HUB = { x: 260, y: 190 };
// Eight nodes on an ellipse around the hub, alternating the four things a campus is made of.
const NODES = [
  { x: 450, y: 190, kind: "person" },
  { x: 394, y: 278, kind: "project" },
  { x: 260, y: 315, kind: "idea" },
  { x: 126, y: 278, kind: "college" },
  { x: 70, y: 190, kind: "person" },
  { x: 126, y: 102, kind: "project" },
  { x: 260, y: 65, kind: "idea" },
  { x: 394, y: 102, kind: "college" },
];
const CHORDS = [
  [0, 7],
  [3, 4],
  [5, 6],
];

const line = { stroke: "var(--foreground)", strokeWidth: 1.75, strokeLinecap: "round", strokeLinejoin: "round", fill: "none" };

function Glyph({ kind, x, y }) {
  if (kind === "person")
    return (
      <g {...line}>
        <circle cx={x} cy={y - 5} r="5" />
        <path d={`M${x - 9} ${y + 10} q9 -13 18 0`} />
      </g>
    );
  if (kind === "project")
    return (
      <g {...line}>
        <rect x={x - 9} y={y - 8} width="18" height="16" rx="2.5" />
        <path d={`M${x - 4} ${y - 1} h8 M${x - 4} ${y + 4} h5`} />
      </g>
    );
  if (kind === "idea")
    return (
      <g {...line}>
        <path d={`M${x} ${y - 11} l10 11 l-10 11 l-10 -11 z`} />
      </g>
    );
  return (
    <g {...line}>
      <path d={`M${x - 10} ${y + 9} v-11 l10 -8 l10 8 v11 z`} />
      <path d={`M${x - 3} ${y + 9} v-6 h6 v6`} />
    </g>
  );
}

/**
 * People, projects, ideas and colleges connected around one hub: the product in a single picture. The spokes draw with the
 * scroll (GSAP DrawSVG, scrubbed) and the nodes pop in as they are reached. Generic shapes, no names, no numbers.
 */
export function CampusGraph({ className }) {
  return (
    <svg
      role="img"
      aria-label="Diagram: people, projects, ideas and college communities connected around UniSphere"
      viewBox="0 0 520 380"
      fill="none"
      data-draw="scrub"
      className={cn("h-auto w-full", className)}
    >
      <ellipse cx={HUB.x} cy={HUB.y} rx="198" ry="132" stroke="var(--border-strong)" strokeWidth="1.5" strokeDasharray="3 9" />
      {NODES.map((n, i) => (
        <path key={`s${i}`} data-path d={`M${HUB.x} ${HUB.y} L${n.x} ${n.y}`} stroke="var(--border-strong)" strokeWidth="1.75" strokeLinecap="round" />
      ))}
      {CHORDS.map(([a, b], i) => (
        <path key={`c${i}`} data-path d={`M${NODES[a].x} ${NODES[a].y} L${NODES[b].x} ${NODES[b].y}`} stroke="var(--signal)" strokeWidth="1.75" strokeLinecap="round" />
      ))}
      {NODES.map((n, i) => (
        <g key={i} data-pop>
          <circle cx={n.x} cy={n.y} r="25" fill="var(--card)" stroke="var(--border-strong)" strokeWidth="1.5" />
          <Glyph kind={n.kind} x={n.x} y={n.y} />
        </g>
      ))}
      <g data-pop>
        <circle cx={HUB.x} cy={HUB.y} r="40" fill="var(--card)" stroke="var(--foreground)" strokeWidth="2" />
        <circle cx={HUB.x} cy={HUB.y} r="9" fill="var(--signal)" />
        <ellipse cx={HUB.x} cy={HUB.y} rx="40" ry="14" transform={`rotate(-24 ${HUB.x} ${HUB.y})`} stroke="var(--foreground)" strokeWidth="1.5" />
      </g>
    </svg>
  );
}
