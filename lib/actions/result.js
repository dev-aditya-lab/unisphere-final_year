/**
 * Uniform result shape for Server Actions:
 *   { ok: true, ... }                         success
 *   { ok: false, error, fieldErrors?, code? } failure (safe to show to the user)
 */

export function ok(data = {}) {
  return { ok: true, ...data };
}

export function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

/** Flatten a ZodError into { field: "first message" }. */
export function fieldErrorsFromZod(zodError) {
  const out = {};
  for (const issue of zodError.issues) {
    const key = issue.path.join(".") || "_form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/** Validate input against a zod schema; returns { data } or { failure }. */
export function parseInput(schema, input) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return {
      failure: fail("Please correct the highlighted fields.", {
        code: "validation",
        fieldErrors: fieldErrorsFromZod(parsed.error),
      }),
    };
  }
  return { data: parsed.data };
}

/** Postgres / PostgREST error -> safe user-facing message. Never leaks SQL details. */
export function dbError(error, fallback = "Something went wrong. Please try again.") {
  if (!error) return fail(fallback);
  const msg = String(error.message || "");
  const map = {
    invalid_username: "Usernames are 3–30 characters: lowercase letters, numbers, hyphen or underscore.",
    reserved_username: "That username is reserved. Please choose another.",
    username_cooldown: "You changed your username recently. You can change it again after 14 days.",
    username_recently_released: "That username was recently used and is temporarily unavailable.",
    invalid_avatar: "That profile photo is not valid.",
    invalid_cover: "That cover image is not valid.",
    department_college_mismatch: "That department does not belong to the selected college.",
    program_college_mismatch: "That program does not belong to the selected college.",
    campus_college_mismatch: "That campus does not belong to the selected college.",
    limit_reached: "You have reached the limit for this list. Remove one to add another.",
    college_required: "To show your profile to “My college”, first add a college to your profile.",
    forbidden: "You do not have permission to do that.",
  };
  for (const [needle, text] of Object.entries(map)) {
    if (msg.includes(needle)) return fail(text, { code: needle });
  }
  if (error.code === "23505") return fail("That already exists.", { code: "duplicate" });
  if (error.code === "42501") return fail("You do not have permission to do that.", { code: "forbidden" });
  if (process.env.NODE_ENV !== "production") console.error("[db]", error);
  return fail(fallback, { code: "db_error" });
}
