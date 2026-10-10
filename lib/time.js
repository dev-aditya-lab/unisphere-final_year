// Timezone helpers (isomorphic, no dependencies). Events are entered as wall-clock time in a chosen
// IANA timezone and stored as UTC instants; they are displayed in the event's own timezone.

export const COMMON_TIMEZONES = [
  "Asia/Kolkata", "UTC", "Asia/Dubai", "Asia/Singapore", "Asia/Tokyo", "Europe/London", "Europe/Berlin",
  "America/New_York", "America/Chicago", "America/Los_Angeles", "Australia/Sydney",
];

export function isValidTimezone(tz) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return typeof tz === "string" && tz.length >= 3 && tz.length <= 64;
  } catch {
    return false;
  }
}

/** Offset (ms) of `timeZone` from UTC at the given instant. */
function offsetAt(utcMs, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/**
 * Convert a wall-clock "YYYY-MM-DDTHH:mm" in `timeZone` to a UTC ISO string.
 * Handles DST transitions by re-checking the offset at the candidate instant.
 */
export function zonedLocalToUtcIso(local, timeZone) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local ?? "");
  if (!m || !isValidTimezone(timeZone)) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const naive = Date.UTC(y, mo - 1, d, h, mi);
  let guess = naive - offsetAt(naive, timeZone);
  guess = naive - offsetAt(guess, timeZone);
  const date = new Date(guess);
  if (Number.isNaN(date.getTime())) return null;
  // Reject rolled-over input (month 13, 25:00…) and wall-clock times that do not exist (DST gaps).
  return utcIsoToZonedLocal(date.toISOString(), timeZone) === local ? date.toISOString() : null;
}

/** UTC ISO -> "YYYY-MM-DDTHH:mm" wall-clock in `timeZone` (for <input type="datetime-local">). */
export function utcIsoToZonedLocal(iso, timeZone) {
  if (!iso) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(new Date(iso));
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

export function formatEventRange(startsAt, endsAt, timeZone) {
  const opts = { dateStyle: "medium", timeStyle: "short", timeZone };
  const start = new Intl.DateTimeFormat("en-IN", opts).format(new Date(startsAt));
  if (!endsAt) return start;
  const sameDay = utcIsoToZonedLocal(startsAt, timeZone).slice(0, 10) === utcIsoToZonedLocal(endsAt, timeZone).slice(0, 10);
  const end = new Intl.DateTimeFormat("en-IN", sameDay ? { timeStyle: "short", timeZone } : opts).format(new Date(endsAt));
  return `${start} – ${end}`;
}

export function tzLabel(timeZone, at = new Date()) {
  const part = new Intl.DateTimeFormat("en-IN", { timeZone, timeZoneName: "short" }).formatToParts(at).find((p) => p.type === "timeZoneName");
  return part?.value ?? timeZone;
}
