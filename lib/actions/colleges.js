"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireProfile } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/rate-limit";
import { parseInput } from "@/lib/actions/result";
import { createCollegeSchema, createDepartmentSchema, createProgramSchema, reportCollegeSchema, setMyCollegeSchema } from "@/lib/validators/college";
import { createCommunityCollege, createCommunityDepartment, createCommunityProgram, getCollegeStructure, removeMyCollege, reportCollege, setMyCollege } from "@/lib/services/colleges";

/**
 * Add a college by name. Returns the existing record when it is already listed (so two people typing the same
 * college end up on one record), a list of near matches to confirm, or a new community-added record.
 * Usable during onboarding, hence `allowIncomplete`.
 */
export async function createCollegeAction(input) {
  const { user } = await requireProfile({ allowIncomplete: true });
  const { data, failure } = parseInput(createCollegeSchema, input);
  if (failure) return failure;

  // Member-facing creation endpoint: a tight per-member limit, on top of the database's own daily ceiling.
  const limited = await enforceRateLimit("college-create", user.id, { limit: 10, windowSec: 3600 });
  if (limited) return limited;

  return createCommunityCollege(data);
}

export async function setMyCollegeAction(input) {
  const { user } = await requireProfile({ allowIncomplete: true });
  const { data, failure } = parseInput(setMyCollegeSchema, input);
  if (failure) return failure;
  const limited = await enforceRateLimit("college-select", user.id, { limit: 30, windowSec: 600 });
  if (limited) return limited;
  const res = await setMyCollege(data.collegeId);
  if (res.ok) revalidatePath("/", "layout");
  return res;
}

/** Takes a college off the member's profile (every role they listed there). */
export async function removeMyCollegeAction(input) {
  const { user } = await requireProfile({ allowIncomplete: true });
  const { data, failure } = parseInput(z.object({ collegeId: z.uuid() }), input);
  if (failure) return failure;
  const limited = await enforceRateLimit("college-select", user.id, { limit: 30, windowSec: 600 });
  if (limited) return limited;
  const res = await removeMyCollege(data.collegeId);
  if (res.ok) revalidatePath("/", "layout");
  return res;
}

export async function reportCollegeAction(input) {
  const { user } = await requireProfile();
  const { data, failure } = parseInput(reportCollegeSchema, input);
  if (failure) return failure;
  const limited = await enforceRateLimit("college-report", user.id, { limit: 20, windowSec: 3600 });
  if (limited) return limited;
  return reportCollege(data);
}

/** A member adds a department their college does not list yet (or gets the one with that name). Usable during onboarding. */
export async function createDepartmentAction(input) {
  const { user } = await requireProfile({ allowIncomplete: true });
  const { data, failure } = parseInput(createDepartmentSchema, input);
  if (failure) return failure;
  const limited = await enforceRateLimit("academic-create", user.id, { limit: 20, windowSec: 3600 });
  if (limited) return limited;
  return createCommunityDepartment(data);
}

/** A member adds a course or degree their college does not list yet (or gets the one with that name). */
export async function createProgramAction(input) {
  const { user } = await requireProfile({ allowIncomplete: true });
  const { data, failure } = parseInput(createProgramSchema, input);
  if (failure) return failure;
  const limited = await enforceRateLimit("academic-create", user.id, { limit: 20, windowSec: 3600 });
  if (limited) return limited;
  return createCommunityProgram(data);
}

/** Departments and courses of a college, including the ones members added. */
export async function getCollegeStructureAction(input) {
  await requireProfile({ allowIncomplete: true });
  const parsed = z.object({ collegeId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Choose a college." };
  const structure = await getCollegeStructure(parsed.data.collegeId);
  return { ok: true, ...structure };
}
