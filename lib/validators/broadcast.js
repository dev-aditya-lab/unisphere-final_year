import { z } from "zod";

export const ACCOUNT_TYPES = ["student", "alumni", "faculty", "staff"];

const usernameList = z
  .array(z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9_-]{1,28}[a-z0-9]$/, "Usernames are 3-30 letters, numbers, - or _"))
  .max(200);
const slugList = z.array(z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "A community address is lowercase letters, numbers and hyphens")).max(20);

/** Who a broadcast is for. The parts add up (a member in any part is included); `accountTypes` then narrows the result. */
export const audienceSchema = z
  .object({
    everyone: z.boolean().default(false),
    colleges: z.array(z.uuid()).max(100).default([]),
    communities: slugList.default([]),
    usernames: usernameList.default([]),
    accountTypes: z.array(z.enum(ACCOUNT_TYPES)).max(4).default([]),
  })
  .refine((a) => a.everyone || a.colleges.length || a.communities.length || a.usernames.length, { message: "Choose who this is for.", path: ["audience"] });

export const broadcastSchema = z.object({
  title: z.string().trim().min(1, "Write a title.").max(100, "A title is at most 100 characters."),
  body: z.string().trim().min(1, "Write a message.").max(2000, "A message is at most 2000 characters."),
  // A page on this site, never another address. The database checks it again.
  href: z
    .string()
    .trim()
    .max(300)
    .refine((v) => v === "" || /^\/($|[^/\\])/.test(v), "Use a page on UniSphere, starting with one slash, for example /events.")
    .optional()
    .default(""),
  push: z.boolean().default(true),
  audience: audienceSchema,
});

export const previewSchema = z.object({ audience: audienceSchema });

/** The audience in the shape the database function reads. */
export function audienceForDatabase(audience, communityIds = []) {
  return {
    ...(audience.everyone ? { everyone: true } : {}),
    colleges: audience.colleges,
    communities: communityIds,
    usernames: audience.usernames,
    account_types: audience.accountTypes,
  };
}

/** "asha, @rahul_k\nmeera" -> ["asha", "rahul_k", "meera"]: what an administrator types into a box, split into names. */
export function splitNames(text) {
  return [...new Set(String(text ?? "").split(/[\s,;]+/).map((s) => s.replace(/^@/, "").trim().toLowerCase()).filter(Boolean))];
}
