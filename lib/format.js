// Date / number formatting (isomorphic). Dates are stored as UTC timestamps and
// rendered in the viewer's locale; event-specific timezone handling lives with events.

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

const UNITS = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

export function timeAgo(input, now = Date.now()) {
  const t = new Date(input).getTime();
  if (Number.isNaN(t)) return "";
  const diffSec = Math.round((t - now) / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 45) return "just now";
  for (const [unit, secs] of UNITS) {
    if (abs >= secs) return rtf.format(Math.round(diffSec / secs), unit);
  }
  return "just now";
}

export function formatDate(input, options = { dateStyle: "medium" }) {
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-IN", options).format(d);
}

export function formatDateTime(input, timeZone) {
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", ...(timeZone ? { timeZone } : {}) }).format(d);
}

export function compactNumber(n) {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n ?? 0);
}
