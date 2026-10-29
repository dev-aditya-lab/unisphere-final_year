import { describe, expect, it } from "vitest";
import { buildWeek, canJoin, sessionStage, startsIn, weekDays } from "@/lib/academy/live";

// 2026-10-29 is a Thursday. 10:00 India time = 04:30 UTC.
const at = (iso) => new Date(iso).getTime();
const NOW = at("2026-10-29T04:30:00Z");
const cls = (startMin, endMin, over = {}) => ({ id: "s", title: "Class", status: "scheduled", starts_at: new Date(NOW + startMin * 60_000).toISOString(), ends_at: new Date(NOW + endMin * 60_000).toISOString(), ...over });

describe("sessionStage", () => {
  it("is live between the start and the end, even if the status still says scheduled", () => {
    expect(sessionStage(cls(-10, 50), NOW)).toBe("live");
    expect(sessionStage(cls(-10, 50, { status: "live" }), NOW)).toBe("live");
  });
  it("says soon within the hour before the start, today later the same day, upcoming after that", () => {
    expect(sessionStage(cls(30, 90), NOW)).toBe("soon");
    expect(sessionStage(cls(200, 260), NOW)).toBe("today");
    expect(sessionStage(cls(60 * 30, 60 * 31), NOW)).toBe("upcoming");
  });
  it("is ended once the end has passed and cancelled whenever it was cancelled", () => {
    expect(sessionStage(cls(-120, -60), NOW)).toBe("ended");
    expect(sessionStage(cls(-10, 50, { status: "cancelled" }), NOW)).toBe("cancelled");
  });
});

describe("canJoin", () => {
  it("opens an hour before the start and closes two hours after the end, matching the database", () => {
    expect(canJoin(cls(61, 120), NOW)).toBe(false);
    expect(canJoin(cls(59, 120), NOW)).toBe(true);
    expect(canJoin(cls(-30, 30), NOW)).toBe(true);
    expect(canJoin(cls(-300, -180), NOW)).toBe(false);
    expect(canJoin(cls(-300, -100), NOW)).toBe(true);
    expect(canJoin(cls(0, 30, { status: "cancelled" }), NOW)).toBe(false);
  });
});

describe("startsIn", () => {
  it("speaks in minutes, hours and days", () => {
    expect(startsIn(new Date(NOW + 25 * 60_000).toISOString(), NOW)).toBe("in 25 min");
    expect(startsIn(new Date(NOW + 3 * 3600_000).toISOString(), NOW)).toBe("in 3 h");
    expect(startsIn(new Date(NOW + 30 * 3600_000).toISOString(), NOW)).toBe("tomorrow");
    expect(startsIn(new Date(NOW + 4 * 86_400_000).toISOString(), NOW)).toBe("in 4 days");
    expect(startsIn(new Date(NOW - 1000).toISOString(), NOW)).toBe("now");
  });
});

describe("the student's week", () => {
  it("starts on the Monday of the current week in India time", () => {
    const days = weekDays(NOW);
    expect(days.map((d) => d.day)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    expect(days[0].key).toBe("2026-10-26");
    expect(days[6].key).toBe("2026-11-01");
  });
  it("puts weekly timetable slots, dated classes and deadlines on the right days, in time order", () => {
    const week = buildWeek({
      now: NOW,
      courses: [{ id: "c1", title: "Web Dev", timetable: [{ day: "Thu", start: "19:00", end: "20:30", topic: "Backend" }, { day: "Mon", start: "09:00", end: "10:00", topic: "" }] }],
      sessions: [{ id: "s1", title: "Doubt session", starts_at: "2026-10-29T03:30:00Z", ends_at: "2026-10-29T04:30:00Z", course: { title: "Web Dev" } }],
      deadlines: [{ id: "a1", title: "Project 1", due_at: "2026-10-30T18:29:00Z", course: { title: "Web Dev" } }],
    });
    const thu = week.find((d) => d.day === "Thu");
    expect(thu.items.map((i) => `${i.kind}:${i.start}`)).toEqual(["session:09:00", "weekly:19:00"]);
    expect(week.find((d) => d.day === "Mon").items[0]).toMatchObject({ kind: "weekly", title: "Class", start: "09:00" });
    expect(week.find((d) => d.day === "Fri").items[0]).toMatchObject({ kind: "deadline", title: "Project 1 is due", start: "23:59" });
  });
  it("leaves out anything outside this week", () => {
    const week = buildWeek({ now: NOW, courses: [], sessions: [{ id: "s", title: "Later", starts_at: "2026-11-10T04:30:00Z", ends_at: "2026-11-10T05:30:00Z" }], deadlines: [] });
    expect(week.flatMap((d) => d.items)).toEqual([]);
  });
});
