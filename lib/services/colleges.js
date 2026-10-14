import "server-only";
import { createClient } from "@/lib/supabase/server";
import { dbError, fail, ok } from "@/lib/actions/result";

/** Departments and programs, for the few colleges that define a structure (RGEC, for example). */
export async function getCollegeStructure(collegeId) {
  if (!collegeId) return { departments: [], academic_programs: [] };
  const supabase = await createClient();
  const { data } = await supabase
    .from("colleges")
    .select("departments(id, name), academic_programs(id, name, department_id)")
    .eq("id", collegeId)
    .eq("is_active", true)
    .maybeSingle();
  return {
    departments: [...(data?.departments ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    academic_programs: [...(data?.academic_programs ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
  };
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

/** Members who chose this college and whose profile the viewer is allowed to see (RLS does the filtering). */
export async function listCollegeMembers(collegeId, limit = 12) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, username, full_name, avatar_key, headline, account_type, verification_status, skills, open_to_collaboration, open_to_mentoring, graduation_year")
    .eq("college_id", collegeId)
    .in("status", ["active", "restricted"])
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((p) => ({ ...p, verified: p.verification_status === "verified" }));
}
