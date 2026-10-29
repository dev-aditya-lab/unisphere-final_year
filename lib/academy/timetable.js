// The weekly timetable of a course. Administrators type one slot per line ("Mon | 19:00-20:30 | Topic"); it is stored as rows
// [{ day, start, end, topic }] and shown as a table. India time throughout. The database re-checks the rows (_academy_timetable_valid).

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const DAY_NAMES = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" };
export const MAX_SLOTS = 40;

const LINE = /^([A-Za-z]{3,9})\s*\|\s*(\d{1,2}):(\d{2})\s*[-–to]+\s*(\d{1,2}):(\d{2})\s*(?:\|\s*(.*))?$/;

const dayKey = (word) => {
  const w = word.slice(0, 3).toLowerCase();
  return DAYS.find((d) => d.toLowerCase() === w) ?? null;
};
const hhmm = (h, m) => (Number(h) <= 23 && Number(m) <= 59 ? `${String(h).padStart(2, "0")}:${m}` : null);

/** Text -> { rows } or { error }. Blank lines are ignored. */
export function parseTimetable(text) {
  const rows = [];
  const lines = String(text ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length > MAX_SLOTS) return { error: `At most ${MAX_SLOTS} lines.` };
  for (const [i, line] of lines.entries()) {
    const m = LINE.exec(line);
    const day = m && dayKey(m[1]);
    const start = m && hhmm(m[2], m[3]);
    const end = m && hhmm(m[4], m[5]);
    if (!m || !day || !start || !end) return { error: `Line ${i + 1}: use "Mon | 19:00-20:30 | Topic" (day, then start-end in 24-hour time).` };
    if (end <= start) return { error: `Line ${i + 1}: the end must be after the start.` };
    const topic = (m[6] ?? "").trim();
    if (topic.length > 120) return { error: `Line ${i + 1}: the topic can be at most 120 characters.` };
    rows.push({ day, start, end, topic });
  }
  rows.sort((a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day) || a.start.localeCompare(b.start));
  return { rows };
}

/** Stored rows -> the text an administrator edits. */
export const timetableToText = (rows) => (Array.isArray(rows) ? rows : []).map((r) => `${r.day} | ${r.start}-${r.end}${r.topic ? ` | ${r.topic}` : ""}`).join("\n");

/** "19:00" -> "7:00 PM" */
export function clock(hhmmText) {
  const [h, m] = String(hhmmText).split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return String(hhmmText);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
