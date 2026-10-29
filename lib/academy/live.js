// How a live class looks to the people in it, worked out from its times. Pure functions, so every page says the same thing.
// The database moves a class from "scheduled" to "live" to "completed" on its own (academy_advance_sessions); these helpers do not
// trust that to have run yet, so a page is right even a few minutes before the worker's next turn.
import { DAYS } from "@/lib/academy/timetable";

/** From one hour before the start until two hours after the end: the same window the database allows (academy_session_access). */
export const JOIN_OPENS_MINUTES = 60;
export const JOIN_CLOSES_AFTER_END_MINUTES = 120;

/** The current time, read here (not inside a page or component) so a page asks for it once and passes it down. */
export const nowMs = () => Date.now();

const MIN = 60_000;

/** "cancelled" | "live" | "soon" (starts within the hour) | "today" | "upcoming" | "ended" */
export function sessionStage(s, now = Date.now()) {
  if (s.status === "cancelled") return "cancelled";
  const start = new Date(s.starts_at).getTime();
  const end = new Date(s.ends_at).getTime();
  if (now >= end) return "ended";
  if (now >= start) return "live";
  if (start - now <= JOIN_OPENS_MINUTES * MIN) return "soon";
  const day = (t) => new Date(t + 5.5 * 3600_000).toISOString().slice(0, 10); // calendar day in India time
  return day(start) === day(now) ? "today" : "upcoming";
}

/** Is the Join button usable now? (Whether the link exists is the database's decision.) */
export function canJoin(s, now = Date.now()) {
  if (s.status === "cancelled") return false;
  const start = new Date(s.starts_at).getTime();
  const end = new Date(s.ends_at).getTime();
  return now >= start - JOIN_OPENS_MINUTES * MIN && now <= end + JOIN_CLOSES_AFTER_END_MINUTES * MIN;
}

/** "in 25 min", "in 3 h", "tomorrow", "in 4 days" for a class that has not started. */
export function startsIn(iso, now = Date.now()) {
  const diff = new Date(iso).getTime() - now;
  if (diff <= 0) return "now";
  const m = Math.round(diff / MIN);
  if (m < 60) return `in ${Math.max(m, 1)} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `in ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "tomorrow" : `in ${d} days`;
}

export const STAGE_LABEL = { live: "Live now", soon: "Starting soon", today: "Today", upcoming: "Upcoming", ended: "Ended", cancelled: "Cancelled" };

// ── A student's week ───────────────────────────────────────────────────────

const IST = 5.5 * 3600_000;
const istDate = (t) => new Date(t + IST);
/** The seven days starting at the Monday of the week containing `now` (India time): [{ key: "2026-10-26", day: "Mon", ... }]. */
export function weekDays(now = Date.now()) {
  const today = istDate(now);
  const monday = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) - ((today.getUTCDay() + 6) % 7) * 86_400_000;
  return DAYS.map((day, i) => {
    const d = new Date(monday + i * 86_400_000);
    return { day, key: d.toISOString().slice(0, 10), label: d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }) };
  });
}

/**
 * One list per day for a week: the repeating timetable slots of every course the student can open, the dated live classes, and
 * assignment deadlines. Each entry is { kind, title, course, start, end?, href?, session? } sorted by time within the day.
 */
export function buildWeek({ courses, sessions, deadlines, now = Date.now() }) {
  const days = weekDays(now).map((d) => ({ ...d, items: [] }));
  const byKey = new Map(days.map((d) => [d.key, d]));
  const dayOf = new Map(days.map((d) => [d.day, d]));

  for (const c of courses) {
    for (const slot of c.timetable ?? []) {
      dayOf.get(slot.day)?.items.push({ kind: "weekly", title: slot.topic || "Class", course: c.title, start: slot.start, end: slot.end, href: `/academy/learn/${c.id}` });
    }
  }
  for (const s of sessions) {
    const t = new Date(s.starts_at).getTime();
    const key = istDate(t).toISOString().slice(0, 10);
    const d = byKey.get(key);
    if (!d) continue;
    const hhmm = (ms) => istDate(ms).toISOString().slice(11, 16);
    d.items.push({ kind: "session", title: s.title, course: s.course?.title ?? s.course_title ?? "", start: hhmm(t), end: hhmm(new Date(s.ends_at).getTime()), session: s });
  }
  for (const a of deadlines) {
    const t = new Date(a.due_at).getTime();
    const d = byKey.get(istDate(t).toISOString().slice(0, 10));
    if (d) d.items.push({ kind: "deadline", title: `${a.title} is due`, course: a.course?.title ?? "", start: istDate(t).toISOString().slice(11, 16), href: "/academy/assignments" });
  }
  for (const d of days) d.items.sort((a, b) => a.start.localeCompare(b.start));
  return days;
}
