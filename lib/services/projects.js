import "server-only";
import { createClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { dbError, fail, ok } from "@/lib/actions/result";
import { uniqueSlug } from "@/lib/slug";
import { runAiTask } from "@/lib/ai";
import { clip } from "@/lib/ai/safety/sanitize";

const RPC_ERRORS = {
  project_unavailable: "That project is not available.",
  not_recruiting: "This project is not recruiting right now.",
  already_member: "Already part of this project.",
  already_requested: "You already have a pending request for this project.",
  already_invited: "That person already has a pending invitation.",
  team_full: "The team is full.",
  role_unavailable: "That role is no longer open.",
  target_unavailable: "That person is not available.",
  request_unavailable: "That request is no longer available.",
  invitation_unavailable: "That invitation is no longer available.",
  forbidden: "You do not have permission to do that.",
  cannot_remove_owner: "The owner cannot be removed.",
  account_restricted: "Your account cannot do that right now.",
  mentor_unavailable: "That mentor is not available.",
  too_many_pending: "You have 3 pending mentorship requests. Wait for a reply or withdraw one first.",
  not_found: "Not found.",
  invalid_role: "Invalid role.",
};

function rpcFail(error) {
  const msg = String(error?.message ?? "");
  for (const [key, text] of Object.entries(RPC_ERRORS)) if (msg.includes(key)) return fail(text, { code: key });
  return dbError(error);
}

// ── Reading ─────────────────────────────────────────────────────────────────

export async function searchProjects({ query = null, status = null, skills = null, looking = null, limit = 18, offset = 0 } = {}) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_projects", { p_query: query, p_status: status, p_skills: skills, p_looking: looking, p_limit: limit, p_offset: offset });
  if (error) {
    console.error("[projects] search failed:", error.message);
    return [];
  }
  return data ?? [];
}

export async function getProjectBySlug(slug) {
  const supabase = await createClient();
  const { data } = await supabase.from("project_cards").select("*").eq("slug", slug).maybeSingle();
  return data ?? null;
}

export async function getMyProjects(userId) {
  const supabase = await createClient();
  const { data: rows } = await supabase.from("project_members").select("project_id, role").eq("user_id", userId);
  if (!rows?.length) return [];
  const { data } = await supabase.from("project_cards").select("*").in("id", rows.map((r) => r.project_id)).order("updated_at", { ascending: false });
  const roleById = new Map(rows.map((r) => [r.project_id, r.role]));
  return (data ?? []).map((p) => ({ ...p, myRole: roleById.get(p.id) }));
}

const CARD = "id, username, full_name, avatar_key, headline, account_type, verification_status, skills";

export async function getProjectTeam(projectId) {
  const supabase = await createClient();
  const { data: members } = await supabase.from("project_members").select("user_id, role, title, joined_at").eq("project_id", projectId).order("joined_at");
  const ids = (members ?? []).map((m) => m.user_id);
  const { data: people } = ids.length ? await supabase.from("profiles").select(CARD).in("id", ids) : { data: [] };
  const byId = new Map((people ?? []).map((p) => [p.id, { ...p, verified: p.verification_status === "verified" }]));
  return (members ?? []).map((m) => ({ ...m, person: byId.get(m.user_id) ?? { id: m.user_id, full_name: "UniSphere member", username: null, avatar_key: null } }));
}

/** What the signed-in viewer has going with a project (pending request / invitation). */
export async function getViewerProjectState(projectId, userId) {
  if (!userId) return { request: null, invitation: null };
  const supabase = await createClient();
  const [request, invitation] = await Promise.all([
    supabase.from("project_join_requests").select("id, role_id, status").eq("project_id", projectId).eq("user_id", userId).eq("status", "pending").maybeSingle(),
    supabase.from("project_invitations").select("id, role_label, message, invited_by").eq("project_id", projectId).eq("invitee_id", userId).eq("status", "pending").maybeSingle(),
  ]);
  return { request: request.data, invitation: invitation.data };
}

/** Manager-only data: join requests (with applicant cards) and outstanding invitations. */
export async function getManagementData(projectId) {
  const supabase = await createClient();
  const [reqs, invs] = await Promise.all([
    supabase.from("project_join_requests").select("id, user_id, role_id, message, created_at").eq("project_id", projectId).eq("status", "pending").order("created_at"),
    supabase.from("project_invitations").select("id, invitee_id, role_label, created_at").eq("project_id", projectId).eq("status", "pending").order("created_at"),
  ]);
  const ids = [...new Set([...(reqs.data ?? []).map((r) => r.user_id), ...(invs.data ?? []).map((i) => i.invitee_id)])];
  const { data: people } = ids.length ? await supabase.from("profiles").select(CARD).in("id", ids) : { data: [] };
  const byId = new Map((people ?? []).map((p) => [p.id, { ...p, verified: p.verification_status === "verified" }]));
  return {
    requests: (reqs.data ?? []).map((r) => ({ ...r, person: byId.get(r.user_id) ?? null })),
    invitations: (invs.data ?? []).map((i) => ({ ...i, person: byId.get(i.invitee_id) ?? null })),
  };
}

export async function getMyInvitations(userId) {
  const supabase = await createClient();
  const { data } = await supabase.from("project_invitations").select("id, project_id, role_label, message, created_at").eq("invitee_id", userId).eq("status", "pending").order("created_at", { ascending: false });
  if (!data?.length) return [];
  const { data: projects } = await supabase.from("project_cards").select("id, slug, name, owner_name").in("id", data.map((i) => i.project_id));
  const byId = new Map((projects ?? []).map((p) => [p.id, p]));
  return data.map((i) => ({ ...i, project: byId.get(i.project_id) })).filter((i) => i.project);
}

// ── Writing ─────────────────────────────────────────────────────────────────

function toRow(input) {
  return {
    name: input.name,
    tagline: input.tagline ?? null,
    problem: input.problem ?? null,
    goals: input.goals,
    solution: input.solution ?? null,
    tech_stack: input.techStack,
    required_skills: input.requiredSkills,
    team_size: input.teamSize,
    status: input.status,
    repo_url: input.repoUrl ?? null,
    demo_url: input.demoUrl ?? null,
    visibility: input.visibility,
    looking_for_members: input.lookingForMembers,
  };
}

export async function createProject({ user, input }) {
  const limited = await enforceRateLimit("project-create", user.id, { limit: 10, windowSec: 3600 });
  if (limited) return limited;
  const supabase = await createClient();

  let created = null;
  for (let attempt = 0; attempt < 3 && !created; attempt++) {
    const { data, error } = await supabase
      .from("projects")
      .insert({ ...toRow(input), owner_id: user.id, slug: uniqueSlug(input.name, { fallback: "project" }) })
      .select("id, slug")
      .single();
    if (!error) created = data;
    else if (!(error.code === "23505" && String(error.message).includes("slug"))) return dbError(error, "Could not create the project.");
  }
  if (!created) return fail("Could not create the project. Please try again.");

  if (input.openRoles.length) {
    const { error } = await supabase.from("project_open_roles").insert(
      input.openRoles.map((r) => ({ project_id: created.id, title: r.title, description: r.description ?? null, skills: r.skills })),
    );
    if (error) console.error("[projects] roles insert failed:", error.message);
  }
  return ok({ id: created.id, slug: created.slug });
}

export async function updateProject({ projectId, input }) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("projects").update(toRow(input)).eq("id", projectId).select("id, slug").maybeSingle();
  if (error) return dbError(error);
  if (!data) return fail("You cannot edit this project.", { code: "forbidden" });
  return ok({ slug: data.slug });
}

export async function addOpenRole({ projectId, role }) {
  const supabase = await createClient();
  const { error } = await supabase.from("project_open_roles").insert({ project_id: projectId, title: role.title, description: role.description ?? null, skills: role.skills });
  if (error) return dbError(error, "Could not add the role.");
  return ok();
}

export async function setRoleOpen({ roleId, isOpen }) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("project_open_roles").update({ is_open: isOpen }).eq("id", roleId).select("id").maybeSingle();
  if (error) return dbError(error);
  return data ? ok() : fail("You cannot change this role.", { code: "forbidden" });
}

export async function deleteRole({ roleId }) {
  const supabase = await createClient();
  const { error } = await supabase.from("project_open_roles").delete().eq("id", roleId);
  return error ? dbError(error) : ok();
}

async function rpc(name, args) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(name, args);
  return error ? rpcFail(error) : ok({ data });
}

export async function requestToJoin({ user, projectId, roleId, message }) {
  const limited = await enforceRateLimit("project-join", user.id, { limit: 15, windowSec: 3600 });
  if (limited) return limited;
  return rpc("request_to_join_project", { p_project: projectId, p_role: roleId ?? null, p_message: message ?? null });
}
export const respondToJoinRequest = ({ requestId, accept }) => rpc("respond_join_request", { p_id: requestId, p_accept: accept });
export const withdrawJoinRequest = ({ requestId }) => rpc("withdraw_join_request", { p_id: requestId });
export async function inviteToProject({ user, projectId, inviteeId, roleLabel, message }) {
  const limited = await enforceRateLimit("project-invite", user.id, { limit: 30, windowSec: 3600 });
  if (limited) return limited;
  return rpc("invite_to_project", { p_project: projectId, p_invitee: inviteeId, p_role_label: roleLabel ?? null, p_message: message ?? null });
}
export const respondToInvitation = ({ invitationId, accept }) => rpc("respond_project_invitation", { p_id: invitationId, p_accept: accept });
export const revokeInvitation = ({ invitationId }) => rpc("revoke_project_invitation", { p_id: invitationId });
export const removeProjectMember = ({ projectId, userId }) => rpc("remove_project_member", { p_project: projectId, p_user: userId });
export const setMemberRole = ({ projectId, userId, role }) => rpc("set_project_member_role", { p_project: projectId, p_user: userId, p_role: role });
export const deleteProject = ({ projectId }) => rpc("delete_project", { p_project: projectId });

// ── Teammate matching ───────────────────────────────────────────────────────

function ruleWhy(c) {
  const parts = [];
  if (c.matched_skills?.length) parts.push(`Lists the skill${c.matched_skills.length > 1 ? "s" : ""} ${c.matched_skills.join(", ")}`);
  if (c.matched_roles?.length) parts.push(`enjoys ${c.matched_roles.join(", ")} work`);
  if (c.matched_interests?.length) parts.push(`interested in ${c.matched_interests.join(", ")}`);
  return parts.join("; ") + ".";
}

/**
 * Explainable teammate suggestions for a project manager. The score and reasons come straight from
 * listed profile facts (see recommend_teammates in migration 0009). AI may rephrase the reason for
 * readability but is given only those facts; if AI is unavailable the rule-based reason is shown.
 */
export async function getTeammateSuggestions({ user, projectId, project }) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("recommend_teammates", { p_project: projectId, p_limit: 8 });
  if (error) return { ok: false, error: "You cannot see suggestions for this project." };

  const items = (data ?? []).map((c) => ({ ...c, why: ruleWhy(c), source: "rules" }));
  let aiUsed = false;
  if (items.length) {
    const res = await runAiTask(
      "explain_teammates",
      {
        project: clip(`${project.name}. ${project.tagline ?? ""} Needs: ${project.required_skills.join(", ")}`, 600),
        candidates: items.map((c) => ({
          id: c.id,
          skills: c.matched_skills.join(", ") || "none matched",
          interests: c.matched_interests.join(", ") || "none matched",
          matched: [c.matched_skills.length ? "skills" : null, c.matched_roles.length ? "preferred roles" : null, c.matched_interests.length ? "interests" : null].filter(Boolean).join(", "),
        })),
      },
      { userId: user.id },
    );
    if (res.ok) {
      aiUsed = true;
      const byId = new Map(res.data.items.map((i) => [i.id, i.why]));
      for (const c of items) {
        if (byId.has(c.id)) {
          c.why = byId.get(c.id);
          c.source = "ai";
        }
      }
    }
  }
  return { ok: true, items, aiUsed };
}

// ── Mentorship ──────────────────────────────────────────────────────────────

export async function searchMentors(args) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_mentors", {
    p_query: args.query || null,
    p_college: args.collegeId ?? null,
    p_department: args.departmentId ?? null,
    p_grad_from: args.gradFrom ?? null,
    p_grad_to: args.gradTo ?? null,
    p_skills: args.skills ?? null,
    p_industry: args.industry || null,
    p_only_mentors: Boolean(args.onlyMentors),
    p_limit: 24,
    p_offset: args.offset ?? 0,
  });
  if (error) {
    console.error("[mentors] search failed:", error.message);
    return [];
  }
  return data ?? [];
}

export async function requestMentorship({ user, mentorId, topic, message }) {
  const limited = await enforceRateLimit("mentorship", user.id, { limit: 10, windowSec: 86400 });
  if (limited) return limited;
  return rpc("request_mentorship", { p_mentor: mentorId, p_topic: topic ?? null, p_message: message });
}
export const respondToMentorship = ({ requestId, accept, message }) => rpc("respond_mentorship", { p_id: requestId, p_accept: accept, p_message: message ?? null });
export const cancelMentorship = ({ requestId }) => rpc("cancel_mentorship", { p_id: requestId });

export async function getMentorshipRequests(userId) {
  const supabase = await createClient();
  const { data: rows } = await supabase.from("mentorship_requests").select("*").or(`mentee_id.eq.${userId},mentor_id.eq.${userId}`).order("created_at", { ascending: false }).limit(100);
  const ids = [...new Set((rows ?? []).flatMap((r) => [r.mentee_id, r.mentor_id]).filter((id) => id !== userId))];
  const { data: people } = ids.length ? await supabase.from("profiles").select("id, username, full_name, avatar_key, headline").in("id", ids) : { data: [] };
  const byId = new Map((people ?? []).map((p) => [p.id, p]));
  const received = [];
  const sent = [];
  for (const r of rows ?? []) {
    if (r.mentor_id === userId) received.push({ ...r, person: byId.get(r.mentee_id) ?? null });
    else sent.push({ ...r, person: byId.get(r.mentor_id) ?? null });
  }
  return { received, sent };
}

export async function getAlumniStories(limit = 10) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("post_feed")
    .select("*")
    .eq("category", "experiences")
    .eq("author_account_type", "alumni")
    .eq("status", "published")
    .is("repost_of_id", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}
