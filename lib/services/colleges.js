import "server-only";
import { createClient } from "@/lib/supabase/server";

/** Active colleges with their departments and programs (public reference data). */
export async function listCollegesWithStructure() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("colleges")
    .select("id, slug, name, short_name, city, state, verification_mode, departments(id, name), academic_programs(id, name, department_id)")
    .eq("is_active", true)
    .order("name");
  if (error) {
    console.error("[colleges] list failed:", error.message);
    return [];
  }
  return (data ?? []).map((c) => ({
    ...c,
    departments: [...(c.departments ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    academic_programs: [...(c.academic_programs ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
  }));
}
