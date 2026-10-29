import { cn } from "@/lib/utils";

/** A bar that fills when it first appears. `value` is 0..100. */
export function ProgressBar({ value, label, className }) {
  const v = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  return (
    <div className={className}>
      <div className="ac-progress" role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} aria-label={label ?? "Progress"}>
        <span style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}

/** A circular progress ring that draws itself. */
export function ProgressRing({ value, size = 72, stroke = 7, className, children }) {
  const v = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  const r = (size - stroke) / 2;
  const len = 2 * Math.PI * r;
  return (
    <div className={cn("relative inline-grid place-items-center", className)} style={{ width: size, height: size }} role="img" aria-label={`${v}% complete`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeOpacity="0.14" strokeWidth={stroke} />
        <circle className="ac-draw" cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" style={{ "--len": len, "--off": len * (1 - v / 100) }} strokeDasharray={len} strokeDashoffset={len * (1 - v / 100)} />
      </svg>
      <span className="absolute text-sm font-bold tabular-nums">{children ?? `${v}%`}</span>
    </div>
  );
}
