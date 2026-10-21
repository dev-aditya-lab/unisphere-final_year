import { z } from "zod";
import { ACCOUNT_TYPES, AVAILABILITY, MESSAGE_PERMISSIONS, PROFILE_VISIBILITY } from "@/lib/constants";
import { fullNameSchema, usernameSchema } from "@/lib/validators/auth";

const emptyToNull = (v) => (typeof v === "string" && v.trim() === "" ? null : v);

const optionalText = (max) =>
  z.preprocess(emptyToNull, z.string().trim().max(max, `Keep this under ${max} characters`).nullable().optional());

/** https/http URL only; empty becomes null. */
const optionalUrl = z.preprocess(
  emptyToNull,
  z
    .string()
    .trim()
    .max(300, "URL is too long")
    .refine((v) => {
      try {
        const u = new URL(v);
        return u.protocol === "https:" || u.protocol === "http:";
      } catch {
        return false;
      }
    }, "Enter a valid http(s) URL")
    .nullable()
    .optional(),
);

/** Lowercase-insensitive de-duplication, trimmed tags, bounded length. */
export const tagList = (maxItems = 30, maxLen = 40) =>
  z
    .array(z.string().trim().min(1).max(maxLen, `Each item must be ${maxLen} characters or fewer`))
    .max(maxItems, `Add at most ${maxItems} items`)
    .transform((arr) => {
      const seen = new Set();
      const out = [];
      for (const raw of arr) {
        const key = raw.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          out.push(raw);
        }
      }
      return out;
    });

const roleValues = ACCOUNT_TYPES.map((t) => t.value);

const yearField = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
  z.number({ error: "Enter a year" }).int().min(1960, "Enter a year from 1960").max(2100, "Enter a year up to 2100").nullable(),
);

/**
 * One school or college a member lists, with their role there. The role is self-described, never proof.
 * `isPrimary` marks the one that is mirrored onto the profile (and used for "my college" features).
 */
export const educationEntrySchema = z
  .object({
    collegeId: z.uuid("Choose a college from the list"),
    role: z.enum(roleValues, { error: "Choose your role at this college" }),
    departmentId: z.uuid().nullable().optional(),
    programId: z.uuid().nullable().optional(),
    startYear: yearField,
    endYear: yearField,
    isPrimary: z.boolean().optional().default(false),
  })
  .refine((e) => e.startYear == null || e.endYear == null || e.endYear >= e.startYear, { path: ["endYear"], error: "The end year cannot be before the start year" });

export const MAX_EDUCATION = 8;

/** Up to eight entries; the same college may repeat only with a different role (student, then alumnus). */
export const educationSchema = z
  .array(educationEntrySchema)
  .max(MAX_EDUCATION, `List at most ${MAX_EDUCATION} schools or colleges`)
  .superRefine((list, ctx) => {
    const seen = new Set();
    list.forEach((e, i) => {
      const key = `${e.collegeId}:${e.role}`;
      if (seen.has(key)) ctx.addIssue({ code: "custom", path: [i, "role"], message: "You already listed this college with this role" });
      seen.add(key);
    });
  });

export const profileSchema = z.object({
  fullName: fullNameSchema,
  username: usernameSchema,
  headline: optionalText(120),
  bio: optionalText(600),
  // Optional: a member may use UniSphere without listing any school or college.
  education: educationSchema,
  // Only asked for the primary college when the member is a student there.
  currentYear: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
    z.number().int().min(1).max(8).nullable(),
  ),
  currentSemester: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
    z.number().int().min(1).max(16).nullable(),
  ),

  skills: tagList(30),
  interests: tagList(30),
  githubUrl: optionalUrl,
  portfolioUrl: optionalUrl,
  linkedinUrl: optionalUrl,
  twitterUrl: optionalUrl,

  openToCollaboration: z.boolean(),
  preferredRoles: tagList(10),
  availability: z.preprocess(emptyToNull, z.enum(AVAILABILITY.map((a) => a.value)).nullable().optional()),

  openToMentoring: z.boolean(),
  mentoringTopics: tagList(10),
  industry: optionalText(80),
  company: optionalText(80),
  jobTitle: optionalText(80),
});

/** Onboarding collects the essential subset. */
export const onboardingSchema = profileSchema.pick({
  fullName: true,
  username: true,
  education: true,
  currentYear: true,
  currentSemester: true,
  skills: true,
  interests: true,
  openToCollaboration: true,
  headline: true,
});

export const privacySchema = z.object({
  visibility: z.enum(PROFILE_VISIBILITY.map((v) => v.value)),
  allowMessagesFrom: z.enum(MESSAGE_PERMISSIONS.map((m) => m.value)),
  showClass: z.boolean(),
  aiAssistEnabled: z.boolean(),
  personalizeFeed: z.boolean().default(true),
});

export const achievementSchema = z.object({
  title: z.string().trim().min(2, "Add a title").max(120),
  description: optionalText(500),
  achievedOn: z.preprocess(emptyToNull, z.iso.date().nullable().optional()),
  url: optionalUrl,
});

export const experienceSchema = z
  .object({
    kind: z.enum(["work", "internship", "research", "volunteer"]),
    title: z.string().trim().min(2, "Add a title").max(120),
    organization: z.string().trim().min(1, "Add an organization").max(120),
    startDate: z.preprocess(emptyToNull, z.iso.date().nullable().optional()),
    endDate: z.preprocess(emptyToNull, z.iso.date().nullable().optional()),
    description: optionalText(800),
  })
  .refine((v) => !v.startDate || !v.endDate || v.endDate >= v.startDate, {
    path: ["endDate"],
    error: "End date must be after the start date",
  });
