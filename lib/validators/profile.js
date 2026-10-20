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

const accountTypeValues = ACCOUNT_TYPES.map((t) => t.value);

export const profileSchema = z.object({
  fullName: fullNameSchema,
  username: usernameSchema,
  headline: optionalText(120),
  bio: optionalText(600),
  // Optional and self-described: it is never proof of anything.
  accountType: z.preprocess(emptyToNull, z.enum(accountTypeValues).nullable().optional()),

  // Optional: a member may use UniSphere without connecting a college.
  collegeId: z.uuid("Choose a college from the list").nullable().optional(),
  campusId: z.uuid().nullable().optional(),
  departmentId: z.uuid().nullable().optional(),
  programId: z.uuid().nullable().optional(),
  graduationYear: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
    z.number().int().min(1960).max(2100).nullable(),
  ),
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
export const onboardingSchema = profileSchema
  .pick({
    fullName: true,
    username: true,
    accountType: true,
    collegeId: true,
    departmentId: true,
    programId: true,
    graduationYear: true,
    currentYear: true,
    currentSemester: true,
    skills: true,
    interests: true,
    openToCollaboration: true,
    headline: true,
  })
  .extend({ collegeId: z.uuid("Choose a college from the list").nullable().optional() });

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
