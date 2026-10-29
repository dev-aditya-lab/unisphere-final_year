import "server-only";
import { redirect } from "next/navigation";
import { hasPermission, requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PAGE_SIZE } from "@/lib/admin/paging";

/**
 * Reads for the Academy pages inside the admin console. Every query runs through the staff member's own session, so Row Level
 * Security and the database functions decide what comes back; the permission check here only sends the wrong person to /forbidden
 * instead of showing an empty page.
 */

/** Page guard: the caller must hold at least one of the permissions. Returns which ones they hold. */
export async function needAcademy(...permissions) {
  await requireProfile();
  const held = {};
  for (const p of permissions) held[p] = await hasPermission(p);
  if (!permissions.some((p) => held[p])) redirect("/forbidden");
  return held;
}

export async function can(permission) {
  return hasPermission(permission);
}

export const offset = (page) => (Math.max(1, Number(page) || 1) - 1) * PAGE_SIZE;

export async function rows(name, args = {}) {
  const { data, error } = await (await createClient()).rpc(name, args);
  if (error) {
    console.error(`[academy-admin] ${name}:`, error.code, String(error.message).slice(0, 100));
    return [];
  }
  return data ?? [];
}

export async function allCourses({ kind = null, status = null, q = null, page = null } = {}) {
  let query = (await createClient()).from("academy_courses").select("id, code, slug, kind, title, status, price_minor, category_id, published_at, updated_at, enrollment_limit, category:academy_categories(name, code_prefix)", { count: "exact" }).order("created_at", { ascending: false });
  if (kind) query = query.eq("kind", kind);
  if (status) query = query.eq("status", status);
  const term = String(q ?? "").trim().replace(/[%,()*]/g, " ").slice(0, 60);
  if (term) query = query.or(`title.ilike.%${term}%,code.ilike.%${term}%`);
  if (page) query = query.range(offset(page), offset(page) + PAGE_SIZE - 1);
  const { data, count } = await query;
  return { courses: data ?? [], total: count ?? 0 };
}

export async function courseOptions() {
  const { data } = await (await createClient()).from("academy_courses").select("id, code, title, kind, status").neq("status", "archived").order("code");
  return data ?? [];
}

export async function categoriesAll() {
  const { data } = await (await createClient()).from("academy_categories").select("*").order("position").order("name");
  return data ?? [];
}

export async function mentorsAll() {
  const { data } = await (await createClient()).from("academy_mentors").select("*").order("display_name");
  return data ?? [];
}

/** Everything the course editor shows, in one place. */
export async function courseWorkspace(id) {
  const supabase = await createClient();
  const { data: course } = await supabase.from("academy_courses").select("*, category:academy_categories(name, code_prefix)").eq("id", id).maybeSingle();
  if (!course) return null;
  const [modules, lessons, contents, questions, keys, resources, cohorts, rules, mentors, assignments, orderCount] = await Promise.all([
    supabase.from("academy_modules").select("*").eq("course_id", id).order("position"),
    supabase.from("academy_lessons").select("*").eq("course_id", id).order("position"),
    supabase.from("academy_lesson_content").select("*, lesson:academy_lessons!inner(course_id)").eq("lesson.course_id", id),
    supabase.from("academy_quiz_questions").select("*, lesson:academy_lessons!inner(course_id)").eq("lesson.course_id", id).order("position"),
    supabase.from("academy_quiz_keys").select("question_id, correct"),
    supabase.from("academy_resources").select("*").eq("course_id", id).order("position"),
    supabase.from("academy_cohorts").select("*").eq("course_id", id).order("starts_at"),
    supabase.from("academy_price_rules").select("*").eq("course_id", id).order("created_at", { ascending: false }),
    supabase.from("academy_course_mentors").select("role, position, mentor:academy_mentors(user_id, display_name)").eq("course_id", id),
    supabase.from("academy_assignments").select("*").eq("course_id", id).order("created_at"),
    supabase.from("academy_order_items").select("id", { count: "exact", head: true }).eq("course_id", id),
  ]);
  const keyByQ = new Map((keys.data ?? []).map((k) => [k.question_id, k.correct]));
  return {
    course, modules: modules.data ?? [], lessons: lessons.data ?? [],
    contents: new Map((contents.data ?? []).map((c) => [c.lesson_id, c])),
    questions: (questions.data ?? []).map((q) => ({ ...q, correct: keyByQ.get(q.id) ?? [] })),
    resources: resources.data ?? [], cohorts: cohorts.data ?? [], rules: rules.data ?? [],
    mentors: (mentors.data ?? []).map((m) => ({ role: m.role, ...m.mentor })), assignments: assignments.data ?? [],
    hasOrders: (orderCount.count ?? 0) > 0,
  };
}
