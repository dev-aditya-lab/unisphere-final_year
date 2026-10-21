import "server-only";
import { createClient } from "@/lib/supabase/server";
import { dbError, fail, ok } from "@/lib/actions/result";

/** Departments and programs a college has, including the ones members added (hidden ones are left out). */
export async function getCollegeStructure(collegeId) {
  if (!collegeId) return { departments: [], academic_programs: [] };
  const supabase = await createClient();
  const { data } = await supabase
    .from("colleges")
    .select("departments(id, name, is_active), academic_programs(id, name, department_id, is_active)")
    .eq("id", collegeId)
    .eq("is_active", true)
    .maybeSingle();
  const visible = (list) => [...(list ?? [])].filter((x) => x.is_active).map(({ is_active, ...rest }) => rest).sort((a, b) => a.name.localeCompare(b.name));
  return { departments: visible(data?.departments), academic_programs: visible(data?.academic_programs) };
}

/**
 * The schools and colleges a member lists, primary first, each with the college summary and the names of its department and
 * course. What the viewer may see is decided by row level security (whoever can see the profile can see this).
 */
export async function getEducation(userId) {
  if (!userId) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("profile_education")
    .select("id, role, college_id, department_id, program_id, start_year, end_year, is_primary, position, colleges(id, slug, name, short_name, city, state, country, listing_status), departments(name), academic_programs(name)")
    .eq("user_id", userId)
    .order("is_primary", { ascending: false })
    .order("position");
  return (data ?? []).map((e) => ({
    id: e.id,
    role: e.role,
    collegeId: e.college_id,
    departmentId: e.department_id,
    programId: e.program_id,
    startYear: e.start_year,
    endYear: e.end_year,
    isPrimary: e.is_primary,
    college: e.colleges,
    departmentName: e.departments?.name ?? null,
    programName: e.academic_programs?.name ?? null,
  }));
}

/** Department and course lists for each college in `education`, keyed by college id (for the editor). */
export async function getEducationStructures(education) {
  const ids = [...new Set(education.map((e) => e.collegeId))];
  const pairs = await Promise.all(ids.map(async (id) => [id, await getCollegeStructure(id)]));
  return Object.fromEntries(pairs);
}

const ACADEMIC_ERRORS = {
  invalid_item_name: "Enter just the name, using letters.",
  item_unavailable: "That name is not available. Please choose another.",
  rate_limited: "You have added several departments and courses today already. Please try again tomorrow, or choose one from the list.",
  college_not_found: "That college is no longer listed. Please choose another.",
  department_college_mismatch: "That department does not belong to the selected college.",
  account_restricted: "Your account cannot do that right now.",
};

function academicError(error) {
  const msg = String(error?.message ?? "");
  for (const [needle, text] of Object.entries(ACADEMIC_ERRORS)) if (msg.includes(needle)) return fail(text, { code: needle });
  return dbError(error);
}

/** Adds a department to a college, or returns the one with that name. */
export async function createCommunityDepartment({ collegeId, name }) {
  const { data, error } = await (await createClient()).rpc("create_community_department", { p_college: collegeId, p_name: name });
  return error ? academicError(error) : ok(data);
}

/** Adds a course or degree to a college, or returns the one with that name. */
export async function createCommunityProgram({ collegeId, name, departmentId = null, level = "undergraduate" }) {
  const { data, error } = await (await createClient()).rpc("create_community_program", { p_college: collegeId, p_name: name, p_department: departmentId, p_level: level });
  return error ? academicError(error) : ok(data);
}

/** One college by id, in the shape the picker shows. */
export async function getCollegeSummary(collegeId) {
  if (!collegeId) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("colleges")
    .select("id, slug, name, short_name, city, state, country, listing_status")
    .eq("id", collegeId)
    .maybeSingle();
  return data ?? null;
}

const ERRORS = {
  invalid_college_name: "Enter the name of the college, without links or symbols.",
  invalid_location: "Check the city, state or country: keep them short and plain.",
  invalid_website: "Enter the website as a full link (https://...).",
  rate_limited: "You have added several colleges today already. Please try again tomorrow, or choose one from the list.",
  college_not_found: "That college is no longer listed. Please choose another.",
  already_reported: "You have already reported this. Thank you, a moderator will take a look.",
  invalid_duplicate: "Choose the other college this one duplicates.",
  invalid_correction: "Say what should be corrected and what it should be.",
  not_found: "That college is no longer listed.",
  account_restricted: "Your account cannot do that right now.",
};

function collegeError(error) {
  const msg = String(error?.message ?? "");
  for (const [needle, text] of Object.entries(ERRORS)) {
    if (msg.includes(needle)) return fail(text, { code: needle });
  }
  return dbError(error);
}

/** Matches for what the member has typed so far (names, short names, aliases, similar spellings). */
export async function searchColleges(q, limit = 8) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_colleges", { p_q: q, p_limit: limit });
  if (error) {
    console.error("[colleges] search failed:", error.message);
    return { ok: false, error: "Search is unavailable right now.", results: [] };
  }
  return { ok: true, results: data ?? [] };
}

/** The existing record if there is one, near matches to confirm, or a new community-added, unverified record. */
export async function createCommunityCollege(input) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_community_college", {
    p_name: input.name,
    p_city: input.city ?? null,
    p_state: input.state ?? null,
    p_country: input.country ?? null,
    p_website: input.website ?? null,
    p_force: Boolean(input.force),
  });
  if (error) return collegeError(error);
  return ok(data);
}

export async function setMyCollege(collegeId) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_my_college", { p_college: collegeId });
  return error ? collegeError(error) : ok();
}

export async function removeMyCollege(collegeId) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_my_college", { p_college: collegeId });
  return error ? collegeError(error) : ok();
}

export async function reportCollege(input) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("report_college", {
    p_college: input.collegeId,
    p_kind: input.kind,
    p_field: input.field ?? null,
    p_proposed: input.proposed ?? null,
    p_duplicate_of: input.duplicateOf ?? null,
    p_note: input.note ?? null,
  });
  return error ? collegeError(error) : ok();
}

export async function getCollegeBySlug(slug) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_college_by_slug", { p_slug: slug });
  return data?.[0] ?? null;
}

export async function listCollegeDirectory({ q = null, page = 1, pageSize = 24 } = {}) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_colleges_directory", {
    p_q: q || null,
    p_limit: pageSize,
    p_offset: (Math.max(1, page) - 1) * pageSize,
  });
  if (error) {
    console.error("[colleges] directory failed:", error.message);
    return { items: [], total: 0 };
  }
  return { items: data ?? [], total: Number(data?.[0]?.total_count ?? 0) };
}

/**
 * Members who list this college (as their primary college or among their other ones) and whose profile the viewer is
 * allowed to see (RLS does the filtering). Each carries the role they gave at this college.
 */
export async function listCollegeMembers(collegeId, limit = 12) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profile_education")
    .select("role, profiles!inner(id, username, full_name, avatar_key, headline, account_type, blue_tick, skills, open_to_collaboration, open_to_mentoring, graduation_year, status, created_at)")
    .eq("college_id", collegeId)
    .in("profiles.status", ["active", "restricted"])
    .order("created_at", { ascending: false })
    .limit(limit);
  const seen = new Set();
  const people = [];
  for (const row of data ?? []) {
    const p = row.profiles;
    if (!p || seen.has(p.id)) continue;
    seen.add(p.id);
    people.push({ ...p, account_type: row.role });
  }
  return people;
}
