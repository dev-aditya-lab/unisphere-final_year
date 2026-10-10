/** Date-range filter shared by the dashboard and analytics: presets (?range=7|30|90) or custom ?from=&to=. */

const DAY = 86_400_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
export const RANGE_PRESETS = [7, 30, 90];

const isoDay = (d) => d.toISOString().slice(0, 10);
const valid = (s) => ISO_DATE.test(s ?? "") && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

export function parseRange(sp = {}, now = new Date()) {
  const today = isoDay(now);
  if (valid(sp.from) && valid(sp.to) && sp.from <= sp.to) {
    const days = Math.round((Date.parse(`${sp.to}T00:00:00Z`) - Date.parse(`${sp.from}T00:00:00Z`)) / DAY) + 1;
    if (days <= 366) return { from: sp.from, to: sp.to > today ? today : sp.to, days, preset: null };
  }
  const preset = RANGE_PRESETS.includes(Number(sp.range)) ? Number(sp.range) : 30;
  return { from: isoDay(new Date(now.getTime() - (preset - 1) * DAY)), to: today, days: preset, preset };
}

/** The immediately preceding period of the same length (for "vs previous" comparisons). */
export function previousRange({ from, days }) {
  const end = new Date(Date.parse(`${from}T00:00:00Z`) - DAY);
  const start = new Date(end.getTime() - (days - 1) * DAY);
  return { from: isoDay(start), to: isoDay(end), days };
}
