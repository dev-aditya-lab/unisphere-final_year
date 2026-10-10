/** Student ID helpers shared by the server and the forms (no secrets, no I/O). */

/** Letters and digits only, upper-case: "21-cse/045" and "21CSE045" are the same ID. Null if it cannot be one. */
export function normalizeStudentId(raw) {
  const id = String(raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return id.length >= 4 && id.length <= 24 ? id : null;
}

/** A tiny, non-identifying hint for staff lists: the last three characters. */
export function studentIdHint(normalized) {
  return `••${normalized.slice(-3)}`;
}
