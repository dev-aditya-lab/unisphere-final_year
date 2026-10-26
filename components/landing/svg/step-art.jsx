import { cn } from "@/lib/utils";

/**
 * The three "How it works" illustrations: thin navy line work with one signal accent each, no fills beyond the page colours and no
 * outlines heavier than the type beside them. Every stroke is marked `data-path data-art-path`, so GSAP draws it (as the step
 * arrives during the hold, or as it scrolls into view on a phone). Decorative: the step's text says everything.
 */
const stroke = { stroke: "var(--foreground)", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", fill: "none" };
const accent = { stroke: "var(--signal)", strokeWidth: 2.5, strokeLinecap: "round", strokeLinejoin: "round", fill: "none" };
const mark = { "data-path": "", "data-art-path": "" };

function Frame({ className, children }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 360 260" fill="none" data-draw="once" className={cn("h-auto w-full", className)}>
      {children}
    </svg>
  );
}

/** Step 1: a profile card and a "join" control: anyone can start with an email. */
export function StepJoin({ className }) {
  return (
    <Frame className={className}>
      <ellipse cx="180" cy="130" rx="168" ry="108" stroke="var(--border-strong)" strokeWidth="1.5" strokeDasharray="3 8" />
      <rect x="70" y="52" width="220" height="156" rx="10" fill="var(--card)" stroke="var(--border-strong)" strokeWidth="1.5" />
      <rect x="70" y="52" width="220" height="156" rx="10" {...stroke} {...mark} />
      <circle cx="120" cy="108" r="22" {...stroke} {...mark} />
      <path d="M92 152 q28 -34 56 0" {...stroke} {...mark} />
      <path d="M164 98 H256" {...stroke} {...mark} />
      <path d="M164 118 H226" {...stroke} {...mark} />
      <rect x="104" y="166" width="152" height="26" rx="13" {...accent} {...mark} />
      <path d="M146 179 l8 8 l16 -16" {...accent} {...mark} />
    </Frame>
  );
}

/** Step 2: a post fans out into related work, each with its reason. */
export function StepShare({ className }) {
  return (
    <Frame className={className}>
      <rect x="22" y="88" width="120" height="84" rx="8" fill="var(--card)" stroke="var(--border-strong)" strokeWidth="1.5" />
      <rect x="22" y="88" width="120" height="84" rx="8" {...stroke} {...mark} />
      <path d="M40 112 H110" {...stroke} {...mark} />
      <path d="M40 130 H96" {...stroke} {...mark} />
      <path d="M40 148 H84" {...stroke} {...mark} />
      <path d="M142 130 C 182 130 182 58 222 58" {...accent} {...mark} />
      <path d="M142 130 H222" {...accent} {...mark} />
      <path d="M142 130 C 182 130 182 202 222 202" {...accent} {...mark} />
      {[40, 112, 184].map((y) => (
        <g key={y}>
          <rect x="222" y={y} width="116" height="36" rx="6" fill="var(--card)" stroke="var(--border-strong)" strokeWidth="1.5" />
          <rect x="222" y={y} width="116" height="36" rx="6" {...stroke} {...mark} />
          <path d={`M236 ${y + 14} H300`} {...stroke} {...mark} />
          <path d={`M236 ${y + 25} H278`} stroke="var(--border-strong)" strokeWidth="2" strokeLinecap="round" />
        </g>
      ))}
    </Frame>
  );
}

function Person({ x, y }) {
  return (
    <g>
      <circle cx={x} cy={y - 8} r="13" fill="var(--card)" stroke="var(--border-strong)" strokeWidth="1.5" />
      <circle cx={x} cy={y - 8} r="13" {...stroke} {...mark} />
      <path d={`M${x - 22} ${y + 26} q22 -34 44 0`} {...stroke} {...mark} />
    </g>
  );
}

/** Step 3: three people around one shared project. */
export function StepBuild({ className }) {
  return (
    <Frame className={className}>
      <path d="M96 100 L158 156" {...accent} {...mark} />
      <path d="M264 100 L202 156" {...accent} {...mark} />
      <path d="M180 78 V136" {...accent} {...mark} />
      <rect x="146" y="136" width="68" height="56" rx="8" fill="var(--card)" stroke="var(--border-strong)" strokeWidth="1.5" />
      <rect x="146" y="136" width="68" height="56" rx="8" {...stroke} {...mark} />
      <path d="M160 156 H200" {...stroke} {...mark} />
      <path d="M160 172 H188" {...stroke} {...mark} />
      <Person x={84} y={78} />
      <Person x={276} y={78} />
      <Person x={180} y={52} />
      <path d="M92 222 H268" stroke="var(--border-strong)" strokeWidth="1.5" strokeLinecap="round" />
    </Frame>
  );
}
