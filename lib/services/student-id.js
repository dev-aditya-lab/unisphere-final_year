import "server-only";
import { createHmac } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAppSecret } from "@/lib/env";
import { enforceRateLimit } from "@/lib/rate-limit";
import { dbError, fail, ok } from "@/lib/actions/result";
import { normalizeStudentId, studentIdHint } from "@/lib/student-id";

/**
 * Student-ID verification for Ramgarh Engineering College.
 * The raw ID is only ever held in memory for the length of a request: it is normalised, keyed-hashed with the
 * server secret and compared in the database. It is never stored, logged or returned.
 */
const MAX_FAILURES_PER_DAY = 5;

export function hashStudentId(collegeId, normalizedId) {
  return createHmac("sha256", getAppSecret()).update(`student-id:${collegeId}:${normalizedId}`).digest("hex");
}

const CLAIM_ERRORS = {
  not_found: "We could not match that student ID. Check it and try again, or ask a reviewer to verify you manually.",
  already_claimed: "That student ID is already linked to another account. If it is yours, contact support and we will sort it out.",
  already_verified: "Your account is already verified with a different student ID.",
  wrong_college: "Your profile is set to a different college.",
  account_type_not_supported: "Student ID verification is for students and alumni. Faculty and staff can request manual review.",
  account_restricted: "Your account cannot be verified right now.",
};

export async function claimStudentId({ profile, studentId }) {
  if (!profile.college_id) return fail("Choose your college in your profile first.", { code: "no_college" });
  const normalized = normalizeStudentId(studentId);
  if (!normalized) return fail("Enter your student ID exactly as printed on your ID card.", { code: "invalid_format", fieldErrors: { studentId: "Enter your student ID" } });

  const limited = await enforceRateLimit("student-id", profile.id, { limit: 12, windowSec: 3600 });
  if (limited) return limited;

  const admin = createAdminClient();
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { count: failures } = await admin.from("student_id_attempts").select("id", { count: "exact", head: true }).eq("user_id", profile.id).eq("success", false).gte("created_at", since);
  if ((failures ?? 0) >= MAX_FAILURES_PER_DAY) {
    return fail("Too many unsuccessful attempts today. Please try again tomorrow, or request manual review.", { code: "locked" });
  }

  const { error } = await admin.rpc("claim_student_id", { p_user: profile.id, p_college: profile.college_id, p_hash: hashStudentId(profile.college_id, normalized) });
  if (error) {
    const msg = String(error.message ?? "");
    const key = Object.keys(CLAIM_ERRORS).find((k) => msg.includes(k));
    if (key) {
      if (key === "not_found" || key === "already_claimed") await admin.from("student_id_attempts").insert({ user_id: profile.id, success: false });
      return fail(CLAIM_ERRORS[key], { code: key });
    }
    return dbError(error);
  }
  await admin.from("student_id_attempts").insert({ user_id: profile.id, success: true });
  return ok({ status: "verified" });
}

// ── Staff ───────────────────────────────────────────────────────────────────

/** Parses pasted CSV / one-ID-per-line text: `ID` or `ID,batch-year`. Returns rows ready for the database. */
export function parseRosterText(text, collegeId) {
  const rows = [];
  const invalid = [];
  const seen = new Set();
  for (const [i, raw] of String(text ?? "").split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line) continue;
    const [idPart, yearPart] = line.split(/[,;\t]/).map((s) => s.trim());
    const normalized = normalizeStudentId(idPart);
    const year = yearPart ? Number(yearPart) : null;
    if (!normalized || (yearPart && !(Number.isInteger(year) && year >= 1990 && year <= 2100))) {
      // A header row such as "student_id,year" is silently skipped; anything else is reported.
      if (!(i === 0 && /^[a-z_ ]+$/i.test(idPart))) invalid.push(i + 1);
      continue;
    }
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    rows.push({ hash: hashStudentId(collegeId, normalized), hint: studentIdHint(normalized), year });
  }
  return { rows, invalid };
}

export async function importRoster({ collegeId, text }) {
  const { rows, invalid } = parseRosterText(text, collegeId);
  if (rows.length === 0) return fail("No valid student IDs found. Put one ID per line (optionally followed by a comma and the batch year).", { code: "empty" });
  if (rows.length > 5000) return fail("Import at most 5,000 IDs at a time.", { code: "too_many" });
  const { data, error } = await (await createClient()).rpc("import_student_roster", { p_college: collegeId, p_rows: rows });
  if (error) return String(error.message).includes("forbidden") ? fail("You do not have permission to do that.", { code: "forbidden" }) : dbError(error);
  return ok({ ...data, invalid: invalid.length, invalidLines: invalid.slice(0, 10) });
}
