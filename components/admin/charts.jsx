import { fmtNumber } from "@/components/admin/ui";

/**
 * Dependency-free, server-rendered charts. Each one exposes its numbers as a visually hidden table, so
 * the data is available to screen readers and the chart itself can be `role="img"` with a short summary.
 */

const W = 640;
const H = 180;
const PAD = { top: 12, right: 8, bottom: 22, left: 36 };

function niceMax(max) {
  if (max <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(max));
  const n = max / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

export function TimeSeriesChart({ title, series, color = "var(--chart-1)" }) {
  const points = series ?? [];
  const total = points.reduce((s, p) => s + p.value, 0);
  const peak = Math.max(0, ...points.map((p) => p.value));
  const top = niceMax(peak);
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const band = points.length ? innerW / points.length : innerW;
  const barW = Math.max(1.5, Math.min(22, band * 0.7));
  const ticks = [0, top / 2, top];
  const labelEvery = Math.max(1, Math.ceil(points.length / 6));

  return (
    <figure className="surface p-4">
      <figcaption className="mb-2 flex items-baseline justify-between gap-2">
        <span className="font-heading text-sm font-bold">{title}</span>
        <span className="text-muted-foreground text-xs tabular-nums">{fmtNumber(total)} in this period</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}: ${fmtNumber(total)} in total, busiest day ${fmtNumber(peak)}`} className="h-auto w-full">
        {ticks.map((t) => {
          const y = PAD.top + innerH - (t / top) * innerH;
          return (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y} stroke="var(--border)" strokeWidth="1" />
              <text x={PAD.left - 6} y={y + 3} textAnchor="end" fontSize="10" fill="var(--muted-foreground)">
                {fmtNumber(Math.round(t))}
              </text>
            </g>
          );
        })}
        {points.map((p, i) => {
          const h = (p.value / top) * innerH;
          const x = PAD.left + band * i + (band - barW) / 2;
          return (
            <g key={p.day}>
              <rect x={x} y={PAD.top + innerH - h} width={barW} height={Math.max(h, p.value > 0 ? 1 : 0)} rx="1.5" fill={color}>
                <title>{`${p.day}: ${p.value}`}</title>
              </rect>
              {i % labelEvery === 0 && (
                <text x={x + barW / 2} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--muted-foreground)">
                  {p.day.slice(5)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <table className="sr-only">
        <caption>{title} by day</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">Count</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.day}>
              <td>{p.day}</td>
              <td>{p.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** Horizontal bars for a { label: count } breakdown. */
export function BreakdownBars({ title, data, labels = {}, color = "var(--chart-1)", empty = "No data in this period." }) {
  const rows = Object.entries(data ?? {}).map(([k, n]) => ({ key: k, label: labels[k] ?? k.replace(/_/g, " "), n: Number(n) })).sort((a, b) => b.n - a.n);
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <figure className="surface p-4">
      <figcaption className="font-heading mb-3 text-sm font-bold">{title}</figcaption>
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.key} className="text-[13px]">
              <div className="mb-0.5 flex justify-between gap-2">
                <span className="capitalize">{r.label}</span>
                <span className="text-muted-foreground tabular-nums">{fmtNumber(r.n)}</span>
              </div>
              <div className="bg-muted h-2 overflow-hidden rounded-full" role="presentation">
                <div className="h-full rounded-full" style={{ width: `${(r.n / max) * 100}%`, background: color }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}
