import { z } from "zod";
import { tagList } from "@/lib/validators/profile";
import { isValidTimezone, zonedLocalToUtcIso } from "@/lib/time";

const emptyToNull = (v) => (typeof v === "string" && v.trim() === "" ? null : v);
const optText = (max) => z.preprocess(emptyToNull, z.string().trim().max(max, `Keep this under ${max} characters`).nullable().optional());
const optUrl = z.preprocess(
  emptyToNull,
  z.string().trim().max(400).refine((v) => { try { const u = new URL(v); return u.protocol === "https:" || u.protocol === "http:"; } catch { return false; } }, "Enter a valid http(s) URL").nullable().optional(),
);
const optInt = (min, max) => z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().int().min(min).max(max).nullable().optional());

export const COMMUNITY_KINDS = [
  { value: "club", label: "Club" },
  { value: "student_chapter", label: "Student chapter" },
  { value: "community", label: "Community" },
  { value: "department", label: "Department" },
  { value: "interest", label: "Interest group" },
];

export const communitySchema = z.object({
  name: z.string().trim().min(3, "Name must be at least 3 characters").max(80),
  kind: z.enum(COMMUNITY_KINDS.map((k) => k.value)).default("community"),
  description: optText(1500),
  visibility: z.enum(["public", "college", "private"]).default("college"),
  joinPolicy: z.enum(["open", "request", "invite"]).default("open"),
});

export const EVENT_KINDS = [
  { value: "workshop", label: "Workshop" }, { value: "hackathon", label: "Hackathon" }, { value: "talk", label: "Talk" },
  { value: "meetup", label: "Meetup" }, { value: "competition", label: "Competition" }, { value: "cultural", label: "Cultural" },
  { value: "sports", label: "Sports" }, { value: "other", label: "Other" },
];

export const eventSchema = z
  .object({
    title: z.string().trim().min(3, "Title must be at least 3 characters").max(140),
    description: optText(5000),
    kind: z.enum(EVENT_KINDS.map((k) => k.value)).default("meetup"),
    timezone: z.string().refine(isValidTimezone, "Choose a valid timezone").default("Asia/Kolkata"),
    startsLocal: z.string().min(1, "Choose a start time"),
    endsLocal: z.preprocess(emptyToNull, z.string().nullable().optional()),
    mode: z.enum(["in_person", "online", "hybrid"]).default("in_person"),
    location: optText(200),
    onlineUrl: optUrl,
    registrationMode: z.enum(["none", "external", "in_platform"]).default("in_platform"),
    registrationUrl: optUrl,
    capacity: optInt(1, 100000),
    visibility: z.enum(["public", "college", "community"]).default("college"),
    communityId: z.preprocess(emptyToNull, z.uuid().nullable().optional()),
  })
  .superRefine((v, ctx) => {
    const starts = zonedLocalToUtcIso(v.startsLocal, v.timezone);
    if (!starts) ctx.addIssue({ code: "custom", path: ["startsLocal"], message: "That date and time is not valid in the chosen timezone" });
    if (v.endsLocal) {
      const ends = zonedLocalToUtcIso(v.endsLocal, v.timezone);
      if (!ends) ctx.addIssue({ code: "custom", path: ["endsLocal"], message: "That end time is not valid" });
      else if (starts && ends <= starts) ctx.addIssue({ code: "custom", path: ["endsLocal"], message: "The event must end after it starts" });
    }
    if ((v.mode === "online" || v.mode === "hybrid") && !v.onlineUrl) ctx.addIssue({ code: "custom", path: ["onlineUrl"], message: "Add the link people will use to join" });
    if ((v.mode === "in_person" || v.mode === "hybrid") && !v.location) ctx.addIssue({ code: "custom", path: ["location"], message: "Add where it takes place" });
    if (v.registrationMode === "external" && !v.registrationUrl) ctx.addIssue({ code: "custom", path: ["registrationUrl"], message: "Add the registration link" });
    if (v.visibility === "community" && !v.communityId) ctx.addIssue({ code: "custom", path: ["visibility"], message: "Choose a community, or change the visibility" });
  });

export const OPPORTUNITY_KINDS = [
  { value: "internship", label: "Internship" }, { value: "job", label: "Job" }, { value: "research", label: "Research" },
  { value: "freelance", label: "Freelance" }, { value: "competition", label: "Competition" }, { value: "scholarship", label: "Scholarship" },
];

export const opportunitySchema = z.object({
  title: z.string().trim().min(3, "Title must be at least 3 characters").max(140),
  organization: z.string().trim().min(1, "Add the organization").max(120),
  kind: z.enum(OPPORTUNITY_KINDS.map((k) => k.value)).default("internship"),
  location: optText(120),
  mode: z.enum(["on_site", "remote", "hybrid"]).default("on_site"),
  applyUrl: optUrl,
  deadline: z.preprocess(emptyToNull, z.iso.date().nullable().optional()),
  description: optText(5000),
  skills: tagList(15),
  stipend: optText(80),
  visibility: z.enum(["public", "college"]).default("college"),
});

export const announcementSchema = z.object({
  collegeId: z.uuid(),
  title: z.string().trim().min(3, "Title must be at least 3 characters").max(140),
  body: z.string().trim().min(1, "Write the announcement").max(5000),
  pinned: z.boolean().default(false),
  expiresAt: z.preprocess(emptyToNull, z.iso.date().nullable().optional()),
});
