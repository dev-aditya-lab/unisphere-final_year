import { z } from "zod";
import { tagList } from "@/lib/validators/profile";

const emptyToNull = (v) => (typeof v === "string" && v.trim() === "" ? null : v);
const optText = (max) => z.preprocess(emptyToNull, z.string().trim().max(max, `Keep this under ${max} characters`).nullable().optional());
const optUrl = z.preprocess(
  emptyToNull,
  z
    .string()
    .trim()
    .max(300)
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

export const PROJECT_STATUSES = [
  { value: "idea", label: "Idea" },
  { value: "planning", label: "Planning" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "paused", label: "Paused" },
];

export const roleDraftSchema = z.object({
  title: z.string().trim().min(2, "Role title is required").max(60),
  description: optText(400),
  skills: tagList(10),
});

export const projectSchema = z.object({
  name: z.string().trim().min(3, "Name must be at least 3 characters").max(100),
  tagline: optText(160),
  problem: optText(3000),
  goals: z.array(z.string().trim().min(1).max(200)).max(8).default([]),
  solution: optText(3000),
  techStack: tagList(15),
  requiredSkills: tagList(15),
  teamSize: z.preprocess((v) => (v === "" || v == null ? 4 : Number(v)), z.number().int().min(1).max(30)),
  status: z.enum(PROJECT_STATUSES.map((s) => s.value)).default("idea"),
  repoUrl: optUrl,
  demoUrl: optUrl,
  visibility: z.enum(["public", "college", "private"]).default("college"),
  lookingForMembers: z.boolean().default(false),
  openRoles: z.array(roleDraftSchema).max(6).default([]),
});

export const joinRequestSchema = z.object({
  projectId: z.uuid(),
  roleId: z.uuid().nullable().optional(),
  message: z.string().trim().max(500).optional(),
});

export const inviteSchema = z.object({
  projectId: z.uuid(),
  inviteeId: z.uuid(),
  roleLabel: z.string().trim().max(60).optional(),
  message: z.string().trim().max(500).optional(),
});

export const mentorshipSchema = z.object({
  mentorId: z.uuid(),
  topic: z.string().trim().max(100).optional(),
  message: z.string().trim().min(10, "Write at least a short sentence about what you would like help with").max(600),
});
