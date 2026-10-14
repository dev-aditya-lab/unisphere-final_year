import { z } from "zod";

const optionalText = (max) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().max(max, `Keep this under ${max} characters`).optional(),
  );

const optionalHttpUrl = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
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
    .optional(),
);

/** The only required field is the name. */
export const createCollegeSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, "Enter the name of the college (at least 3 characters)")
    .max(160, "That name is too long")
    .refine((v) => !/(https?:\/\/|www\.|[<>@])/i.test(v), "Enter just the name, not a link or address")
    .refine((v) => /\p{L}/u.test(v), "The name needs some letters"),
  city: optionalText(80),
  state: optionalText(80),
  country: optionalText(80),
  website: optionalHttpUrl,
  // The member looked at the near matches and says theirs is a different college.
  force: z.boolean().optional().default(false),
});

export const searchCollegesSchema = z.object({
  q: z.string().trim().min(2).max(100),
  limit: z.coerce.number().int().min(1).max(15).default(8),
});

export const reportCollegeSchema = z
  .object({
    collegeId: z.uuid(),
    kind: z.enum(["correction", "duplicate", "inaccurate", "abuse"]),
    field: z.enum(["name", "city", "state", "country", "website", "description", "other"]).optional(),
    proposed: optionalText(300),
    duplicateOf: z.uuid().optional(),
    note: optionalText(1000),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "duplicate" && !v.duplicateOf) ctx.addIssue({ code: "custom", path: ["duplicateOf"], message: "Choose the college this duplicates" });
    if (v.kind === "duplicate" && v.duplicateOf === v.collegeId) ctx.addIssue({ code: "custom", path: ["duplicateOf"], message: "Choose a different college" });
    if (v.kind === "correction" && !v.field) ctx.addIssue({ code: "custom", path: ["field"], message: "Choose what needs correcting" });
    if (v.kind === "correction" && !v.proposed) ctx.addIssue({ code: "custom", path: ["proposed"], message: "Enter the correct value" });
  });

export const setMyCollegeSchema = z.object({ collegeId: z.uuid().nullable() });
