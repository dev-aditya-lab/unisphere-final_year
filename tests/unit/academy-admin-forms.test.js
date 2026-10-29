import { describe, expect, it } from "vitest";
import { readinessItems } from "@/components/academy/admin/readiness";
import { LIVE_FIELDS, courseFields, courseInitial } from "@/lib/academy/forms";
import { courseSchema, liveSessionSchema } from "@/lib/validators/academy";

const UUID = "7f9c2c1e-3b0a-4e44-9d0e-1a2b3c4d5e6f";
const fieldsOf = (list) => list.filter((f) => !f.section);

describe("admin forms", () => {
  it("every course field is one the server schema knows, so nothing typed is silently dropped", () => {
    const fields = fieldsOf(courseFields([]));
    const names = fields.map((f) => f.name);
    // timetable_text is turned into rows by the schema, the others are read directly
    const payload = Object.fromEntries(fields.map((f) => [f.name, f.type === "checkbox" ? false : ""]));
    Object.assign(payload, { title: "Web Dev", slug: "web-dev", kind: "course", category_id: UUID, level: "beginner", language: "English", delivery_mode: "live", cert_min_completion: "100", cert_min_score: "0" });
    const parsed = courseSchema.parse(payload);
    for (const n of names) expect(n in parsed || n === "timetable_text" || n.startsWith("cert_"), `${n} is not read by the schema`).toBe(true);
  });

  it("groups the course form under plain headings and every field has a label", () => {
    const list = courseFields([]);
    expect(list.filter((f) => f.section).map((f) => f.section)).toEqual(["The basics", "How it is taught", "What students get", "Seats, access and dates", "Certificate rules", "How it appears in search engines"]);
    for (const f of fieldsOf(list)) expect(f.label, f.name).toBeTruthy();
  });

  it("fills the web address from the title and keeps it editable", () => {
    const slug = fieldsOf(courseFields([])).find((f) => f.name === "slug");
    expect(slug.slugFrom).toBe("title");
  });

  it("schedules a class without a status to type: the clock moves it along, and only cancelling is chosen by hand", () => {
    const names = fieldsOf(LIVE_FIELDS([], [])).map((f) => f.name);
    expect(names).not.toContain("status");
    expect(names).toContain("cancelled");
    const parsed = liveSessionSchema.parse({ course_id: UUID, title: "Day 1", starts_at: "2030-01-10T10:00", ends_at: "2030-01-10T11:00", auto_meet: true, cancelled: false });
    expect(parsed.cancelled).toBe(false);
    expect(parsed.auto_meet).toBe(true);
    expect("status" in parsed).toBe(false);
  });

  it("opens a stored course with its timetable as editable text", () => {
    const form = courseInitial({ tags: [], objectives: [], prerequisites: [], skills: [], outcomes: [], timetable: [{ day: "Mon", start: "19:00", end: "20:30", topic: "Basics" }] });
    expect(form.timetable_text).toBe("Mon | 19:00-20:30 | Basics");
  });
});

describe("the course checklist", () => {
  const base = { kind: "course", price_minor: null, title: "T", short_description: "S", delivery_mode: "recorded", timetable: [], cover_key: null };
  const items = (over = {}, extra = {}) => readinessItems({ course: { ...base, ...over }, lessonCount: 0, mentorCount: 0, upcomingClasses: 0, hasCertificateTemplate: false, ...extra });
  const by = (list, key) => list.find((i) => i.key === key);

  it("blocks publishing on a price and on lessons, and only advises on the rest", () => {
    const list = items();
    expect(list.filter((i) => i.level === "required" && !i.done).map((i) => i.key)).toEqual(["price", "lessons"]);
    expect(by(list, "mentor").level).toBe("needed");
    expect(by(list, "cover").level).toBe("nice");
  });
  it("ticks things off from what is stored", () => {
    const list = items({ price_minor: 0, cover_key: "k" }, { lessonCount: 3, mentorCount: 1, hasCertificateTemplate: true });
    expect(list.every((i) => i.done)).toBe(true);
  });
  it("asks a live course for a class or a timetable, and a recorded one does not need it", () => {
    expect(by(items(), "classes")).toBeUndefined();
    expect(by(items({ delivery_mode: "live" }), "classes").done).toBe(false);
    expect(by(items({ delivery_mode: "hybrid" }, { upcomingClasses: 2 }), "classes").done).toBe(true);
    expect(by(items({ delivery_mode: "live", timetable: [{ day: "Mon" }] }), "classes").done).toBe(true);
  });
  it("does not ask a program or internship for lessons", () => {
    expect(by(items({ kind: "program" }), "lessons")).toBeUndefined();
  });
});
