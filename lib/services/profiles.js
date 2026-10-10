import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Loads everything the public profile page shows. All reads go through the viewer's session, so
 * profile visibility, class-info opt-in and block rules are enforced by Row Level Security.
 */
export async function getProfilePage(username) {
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("*").eq("username", username).maybeSingle();
  if (!profile) return null;

  const [college, department, program, classInfo, achievements, experiences] = await Promise.all([
    profile.college_id ? supabase.from("colleges").select("name, short_name, slug").eq("id", profile.college_id).maybeSingle() : { data: null },
    profile.department_id ? supabase.from("departments").select("name").eq("id", profile.department_id).maybeSingle() : { data: null },
    profile.program_id ? supabase.from("academic_programs").select("name").eq("id", profile.program_id).maybeSingle() : { data: null },
    supabase.from("profile_class_info").select("current_year, current_semester").eq("user_id", profile.id).maybeSingle(),
    supabase.from("profile_achievements").select("id, title, description, achieved_on, url").eq("user_id", profile.id).order("achieved_on", { ascending: false, nullsFirst: false }),
    supabase.from("profile_experiences").select("id, kind, title, organization, start_date, end_date, description").eq("user_id", profile.id).order("start_date", { ascending: false, nullsFirst: false }),
  ]);

  return {
    profile,
    college: college.data,
    department: department.data,
    program: program.data,
    classInfo: classInfo.data,
    achievements: achievements.data ?? [],
    experiences: experiences.data ?? [],
  };
}

/** If a username was changed, return the member's current username so old links keep working. */
export async function resolveRenamedUsername(oldUsername) {
  const admin = createAdminClient();
  const { data: redirect } = await admin
    .from("slug_redirects")
    .select("entity_id")
    .eq("entity_type", "user")
    .eq("old_slug", oldUsername)
    .maybeSingle();
  if (!redirect) return null;
  const { data: p } = await admin.from("profiles").select("username, status").eq("id", redirect.entity_id).maybeSingle();
  return p && ["active", "restricted"].includes(p.status) ? p.username : null;
}
