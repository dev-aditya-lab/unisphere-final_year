import "server-only";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { dbError, fail, ok } from "@/lib/actions/result";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/auth/session";
import { invalidateSettingsCache } from "@/lib/settings";

/**
 * Administration data access. Every call goes through the signed-in staff member's own session, so the
 * database (RLS + SECURITY DEFINER permission checks) is what authorises it — never this file.
 */

import { PAGE_SIZE } from "@/lib/admin/paging";
export { PAGE_SIZE };

const ERRORS = {
  forbidden: "You do not have permission to do that.",
  not_found: "That record no longer exists.",
  reason_required: "Please give a reason.",
  already_resolved: "This report was already resolved.",
  already_decided: "That was already decided.",
  protected_account: "That account is protected. Only a global administrator can act on administrators.",
  cannot_act_on_self: "You cannot take action on your own account or content.",
  cannot_resolve_own_report: "You cannot resolve a report you filed.",
  cannot_review_own_decision: "A different reviewer must decide appeals against your own decisions.",
  cannot_review_own_appeal: "You cannot review your own appeal.",
  invalid_state: "That is not possible in the account's or content's current state.",
  unsupported_action: "That action is not available here.",
  nothing_to_appeal: "There is nothing to appeal.",
  appeal_window_closed: "Appeals must be filed within 30 days of the decision.",
  too_many_pending: "You already have several appeals waiting for review.",
  already_appealed: "You have already appealed this decision.",
  invalid_message: "Please explain your appeal in 10–2000 characters.",
  last_global_admin: "You cannot remove the last global administrator.",
  cannot_grant_to_self: "You cannot grant that to yourself. Ask another administrator.",
  invalid_price: "Enter a price between ₹1 and ₹1,00,000.",
  already_has_tick: "That member already has a blue tick.",
  invalid_document: "That document could not be used.",
  target_not_in_college: "That person does not belong to this college.",
  target_unavailable: "That account is not available.",
  invalid_range: "Choose a valid date range (at most one year).",
  unknown_setting: "That setting does not exist.",
  unknown_flag: "That feature flag does not exist.",
  invalid_scope: "That role does not apply to this scope.",
  invalid_role: "Unknown role.",
  invalid_rows: "The list was empty or too long.",
  profile_changed: "The member changed their college or account type after applying. Ask them to apply again.",
  cannot_review_own_request: "You cannot review your own request. Another administrator has to do it.",
  invalid_decision: "Unknown decision.",
  invalid_college_name: "Enter a valid college name.",
  invalid_website: "Enter the website as a full http(s) link.",
  invalid_status: "Unknown listing status.",
  invalid_merge: "Those two records cannot be merged. Choose two different, listed colleges.",
  invalid_duration: "Choose a period of 1 to 365 days, or leave it open-ended.",
  invalid_name: "Enter a name of 1 to 80 characters.",
  invalid_headline: "The headline must be 160 characters or fewer.",
  invalid_bio: "The bio must be 2000 characters or fewer.",
  nothing_to_change: "Nothing was changed.",
  invalid_username: "That is not a valid username (3-30 letters, numbers, - or _).",
  reserved_username: "That username is reserved.",
  username_recently_released: "That username was released recently and is held for 90 days.",
  date_taken: "Another question is already scheduled for that date.",
  date_in_past: "Choose today or a later date to schedule a question.",
  duplicate_options: "The four answers must all be different.",
  invalid_options: "Give exactly four answers of 1 to 200 characters.",
  invalid_correct: "Choose which answer is correct.",
  has_answers: "Members have already answered this question, so its wording, answers and key can no longer change. Archive it and add a new one.",
  invalid_value: "That value is not allowed. Use a whole number from 0 to 1000.",
  unknown_setting: "That setting does not exist.",
  invalid_amount: "Enter a whole number of Orbits, 1 to 1000 (positive or negative).",
  invalid_key: "The request is missing its safety key. Reload and try again.",
  nothing_to_remove: "That member has no Orbits to take away.",
  already_reversed: "That reward was already reversed.",
  not_reversible: "Only a reward can be reversed.",
  season_overlap: "That season overlaps another one.",
  season_not_ended: "A season can be finalised only after its last day.",
  already_finalized: "That season is already finalised.",
  not_editable: "A finalised season cannot be changed.",
};

// Refusals worth a trail: someone tried a privileged operation they may not perform (or one that is never allowed).
const DENIAL_CODES = ["forbidden", "protected_account", "cannot_act_on_self", "cannot_grant_to_self"];

function rpcFail(error) {
  const msg = String(error?.message ?? "");
  for (const [k, text] of Object.entries(ERRORS)) if (msg.includes(k)) return fail(text, { code: k });
  if (error?.code === "23505" && /username/.test(msg)) return fail("That username is already taken.", { code: "username_taken" });
  return dbError(error);
}

/**
 * Records a refused privileged operation in the audit log (best effort: it must never turn a refusal into an error).
 * It is written with the service role because the refused call rolled back everything it did inside the database.
 * Only the operation name, the target and the refusal code are stored, never the submitted text.
 */
async function recordDenial(name, args, code) {
  try {
    const user = await getAuthUser();
    if (!user) return;
    const target = args?.p_user ?? args?.p_id ?? args?.p_role_id ?? null;
    await createAdminClient().rpc("write_audit_log", {
      p_actor: user.id,
      p_action: `denied.${name}`,
      p_target_type: "rpc",
      p_target_id: target ? String(target) : null,
      p_college: null,
      p_metadata: { code },
    });
  } catch (err) {
    console.error("[admin] could not record a denied operation:", err?.message);
  }
}

/** Mutation: { ok, data } or { ok:false, error }. */
export async function mutate(name, args) {
  const { data, error } = await (await createClient()).rpc(name, args);
  if (!error) return ok({ data });
  const msg = String(error.message ?? "");
  const denied = DENIAL_CODES.find((c) => msg.includes(c));
  if (denied) await recordDenial(name, args, denied);
  return rpcFail(error);
}

/** Page read: returns data, or sends the visitor to /forbidden or a 404 as appropriate. */
export async function read(name, args = {}) {
  const { data, error } = await (await createClient()).rpc(name, args);
  if (error) {
    const msg = String(error.message ?? "");
    if (msg.includes("forbidden")) redirect("/forbidden");
    if (msg.includes("not_found") || error.code === "P0002") notFound();
    throw new Error(`Admin query ${name} failed: ${msg}`);
  }
  return data;
}

export const pageOffset = (page) => (Math.max(1, Number(page) || 1) - 1) * PAGE_SIZE;

// ── Reports / moderation ────────────────────────────────────────────────────
export const listReports = ({ status = "open", severity = null, assigned = null, page = 1 } = {}) =>
  read("list_reports", { p_status: status, p_severity: severity, p_assigned: assigned, p_limit: PAGE_SIZE, p_offset: pageOffset(page) });
export const getReport = (id) => read("get_report", { p_id: id });
export const assignReport = (id, assign) => mutate("assign_report", { p_id: id, p_assign: assign });
export const addReportNote = (id, note) => mutate("add_report_note", { p_id: id, p_note: note });
export const resolveReport = (id, action, reason) => mutate("resolve_report", { p_id: id, p_action: action, p_reason: reason ?? null });
export const moderateUser = (userId, action, reason, days = null) => mutate("moderate_user", { p_user: userId, p_action: action, p_reason: reason, p_days: days });
export const addUserNote = (userId, note) => mutate("admin_add_user_note", { p_user: userId, p_note: note });
export const updateUserProfile = ({ userId, fullName, username, headline, bio, reason }) =>
  mutate("admin_update_profile", { p_user: userId, p_full_name: fullName ?? null, p_username: username ?? null, p_headline: headline ?? null, p_bio: bio ?? null, p_reason: reason });
export const revokeUserSessions = (userId, reason) => mutate("admin_revoke_sessions", { p_user: userId, p_reason: reason });
export const moderateContent = (type, id, action, reason) => mutate("moderate_content", { p_type: type, p_id: id, p_action: action, p_reason: reason });

// ── Appeals ─────────────────────────────────────────────────────────────────
export const listAppeals = ({ status = "pending", page = 1 } = {}) =>
  read("list_appeals", { p_status: status, p_limit: PAGE_SIZE, p_offset: pageOffset(page) });
export const reviewAppeal = (id, decision, note) => mutate("review_appeal", { p_id: id, p_decision: decision, p_note: note });
export const submitAppeal = ({ message, actionId = null }) => mutate("submit_appeal", { p_message: message, p_action_id: actionId });

/** What the signed-in member can appeal, and what they already did. (Used by /suspended and security settings.) */
export async function getMyModerationState(userId) {
  const supabase = await createClient();
  const [{ data: actions }, { data: appeals }] = await Promise.all([
    supabase.from("moderation_actions").select("id, action, reason, created_at").eq("target_user_id", userId)
      .in("action", ["warn", "remove_content", "restrict", "suspend"]).order("created_at", { ascending: false }).limit(10),
    supabase.from("appeals").select("id, action_id, status, review_note, reviewed_at, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(20),
  ]);
  const byAction = new Map((appeals ?? []).map((a) => [a.action_id, a]));
  const now = Date.now();
  return (actions ?? []).map((a) => ({ ...a, appeal: byAction.get(a.id) ?? null, withinWindow: now - new Date(a.created_at).getTime() < 30 * 86_400_000 }));
}

// ── Users and roles ─────────────────────────────────────────────────────────
export const listUsers = ({ q = null, status = null, role = null, college = null, from = null, to = null, sort = "created", dir = "desc", page = 1 } = {}) =>
  read("admin_list_users", { p_q: q, p_status: status, p_role: role, p_college: college, p_from: from, p_to: to, p_sort: sort, p_dir: dir, p_limit: PAGE_SIZE, p_offset: pageOffset(page) });
export const getUserDetail = (id) => read("admin_user_detail", { p_id: id });
export const getUserPosts = (id, page = 1) => read("admin_user_posts", { p_id: id, p_limit: 10, p_offset: (Math.max(1, Number(page) || 1) - 1) * 10 });
/** The permitted export (writes its own audit entry inside the database). Global administrators only. */
export const exportUser = (id) => mutate("admin_export_user", { p_id: id });
export const auditUserEvent = (userId, action, reason = null) => mutate("admin_audit_event", { p_action: action, p_user: userId, p_reason: reason });
export const listRoleAssignments = () => read("list_role_assignments");
export const grantRole = ({ userId, role, collegeId }) => mutate("grant_role", { p_user: userId, p_role: role, p_college: collegeId ?? null });
export const revokeRole = (roleId) => mutate("revoke_role", { p_role_id: roleId });

/** Resolves an exact username to a user the caller may see (for granting roles). */
export async function findUserByUsername(username) {
  const { data } = await (await createClient()).rpc("admin_list_users", { p_q: username, p_limit: 5, p_offset: 0 });
  return (data ?? []).find((u) => u.username === username.toLowerCase()) ?? null;
}

// ── Content oversight ───────────────────────────────────────────────────────
export const listContent = ({ kind, q = null, status = null, page = 1 }) =>
  read("admin_list_content", { p_kind: kind, p_q: q, p_status: status, p_limit: PAGE_SIZE, p_offset: pageOffset(page) });
export const setListingRemoved = (kind, id, removed, reason) =>
  mutate("admin_set_listing_removed", { p_kind: kind, p_id: id, p_removed: removed, p_reason: reason });

// ── Verification ────────────────────────────────────────────────────────────
export const listVerifications = ({ status = "pending", page = 1 } = {}) =>
  read("list_verification_requests", { p_status: status, p_limit: PAGE_SIZE, p_offset: pageOffset(page) });
export const reviewVerification = ({ id, decision, reason, notes }) =>
  mutate("review_college_verification", { p_id: id, p_decision: decision, p_reason: reason ?? null, p_notes: notes ?? null });

// ── Deletion requests ───────────────────────────────────────────────────────
export async function listDeletions(status = "pending") {
  const rows = await read("admin_list_deletions", { p_status: status });
  const now = Date.now();
  return rows.map((r) => ({ ...r, due: r.status === "pending" && new Date(r.scheduled_for).getTime() <= now }));
}
export const reviewDeletion = (id, decision) => mutate("review_deletion_request", { p_id: id, p_decision: decision });

// ── Analytics ───────────────────────────────────────────────────────────────
export const getOverview = ({ college = null, from, to }) => read("admin_overview", { p_college: college, p_from: from, p_to: to });
export async function getSeries(metrics, { college = null, from, to }) {
  const rows = await Promise.all(metrics.map((m) => read("admin_timeseries", { p_metric: m, p_college: college, p_from: from, p_to: to })));
  return Object.fromEntries(metrics.map((m, i) => [m, rows[i]]));
}
export const getAiOverview = (days) => read("admin_ai_overview", { p_days: days });

// ── Settings & flags ────────────────────────────────────────────────────────
export async function listSettingsAndFlags() {
  const supabase = await createClient();
  const [{ data: settings }, { data: flags }] = await Promise.all([
    supabase.from("system_settings").select("key, value, is_public, description, updated_at").order("key"),
    supabase.from("feature_flags").select("key, enabled, description, updated_at").order("key"),
  ]);
  return { settings: settings ?? [], flags: flags ?? [] };
}
export async function setSetting(key, value) {
  const res = await mutate("set_system_setting", { p_key: key, p_value: value });
  if (res.ok) await invalidateSettingsCache();
  return res;
}
export async function setFlag(key, enabled) {
  const res = await mutate("set_feature_flag", { p_key: key, p_enabled: enabled });
  if (res.ok) await invalidateSettingsCache();
  return res;
}

// ── Audit log ───────────────────────────────────────────────────────────────
export async function listAudit({ action = null, actor = null, from = null, to = null, target = null, page = 1, limit = PAGE_SIZE } = {}) {
  let q = (await createClient())
    .from("audit_logs")
    .select("id, actor_id, action, target_type, target_id, college_id, metadata, created_at, actor:profiles!audit_logs_actor_id_fkey(full_name, username)", { count: "exact" })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range((Math.max(1, Number(page) || 1) - 1) * limit, (Math.max(1, Number(page) || 1) - 1) * limit + limit - 1);
  if (action) q = q.ilike("action", `${action.replace(/[%_\\]/g, "\\$&")}%`);
  if (actor) q = q.eq("actor_id", actor);
  if (target) q = q.eq("target_id", target);
  if (from) q = q.gte("created_at", `${from}T00:00:00Z`);
  if (to) q = q.lt("created_at", new Date(new Date(`${to}T00:00:00Z`).getTime() + 86_400_000).toISOString());
  const { data, count, error } = await q;
  if (error) throw new Error(`Audit query failed: ${error.message}`);
  return { rows: data ?? [], total: count ?? 0 };
}

// ── Support inbox ───────────────────────────────────────────────────────────
export async function listContactMessages({ status = "new", page = 1 } = {}) {
  let q = (await createClient()).from("contact_messages").select("*", { count: "exact" }).order("created_at", { ascending: false }).range(pageOffset(page), pageOffset(page) + PAGE_SIZE - 1);
  if (status !== "all") q = q.eq("status", status);
  const { data, count, error } = await q;
  if (error) throw new Error(`Contact query failed: ${error.message}`);
  return { rows: data ?? [], total: count ?? 0 };
}
export async function setContactStatus(id, status) {
  const { data: me } = await (await createClient()).auth.getUser();
  const patch = { status, assigned_to: status === "in_progress" ? me.user?.id : undefined };
  const { error, data } = await (await createClient()).from("contact_messages").update(patch).eq("id", id).select("id");
  if (error) return dbError(error);
  return data?.length ? ok() : fail("You cannot update that message.", { code: "forbidden" });
}

// ── Colleges ────────────────────────────────────────────────────────────────
/**
 * Colleges for the staff pickers (roles, announcements, scope switcher, roster): listed and not merged away, by name. Capped, because the directory grows with the community; the directory page is the place to browse it.
 */
export async function listColleges() {
  const { data } = await (await createClient())
    .from("colleges")
    .select("id, slug, name, short_name, city, state, verification_mode, is_active, listing_status")
    .eq("is_active", true)
    .is("merged_into", null)
    .order("name")
    .limit(300);
  return data ?? [];
}
export async function updateCollege(id, patch) {
  const { data, error } = await (await createClient()).from("colleges").update(patch).eq("id", id).select("id");
  if (error) return dbError(error);
  return data?.length ? ok() : fail("You cannot edit that college.", { code: "forbidden" });
}

// ── College directory (community-added colleges) ────────────────────────────
export const listCollegeDirectory = ({ status = "all", q = null, onlyReported = false, page = 1 } = {}) =>
  read("admin_list_college_directory", { p_status: status, p_q: q, p_only_reported: onlyReported, p_limit: PAGE_SIZE, p_offset: pageOffset(page) });
export const listCollegeReports = ({ status = "open" } = {}) => read("admin_list_college_reports", { p_status: status, p_limit: 100 });
export const resolveCollegeReport = (id, decision, note) => mutate("admin_resolve_college_report", { p_id: id, p_decision: decision, p_note: note ?? null });
export const updateCollegeListing = (d) =>
  mutate("admin_update_college_listing", {
    p_id: d.id, p_name: d.name, p_short_name: d.shortName ?? null, p_city: d.city ?? null, p_state: d.state ?? null, p_country: d.country ?? null,
    p_website: d.website ?? null, p_description: d.description ?? null, p_listing_status: d.listingStatus, p_is_active: d.isActive,
  });
export const addCollegeAlias = (collegeId, alias) => mutate("admin_add_college_alias", { p_college: collegeId, p_alias: alias });
export const mergeColleges = (sourceId, targetId, reason) => mutate("admin_merge_colleges", { p_source: sourceId, p_target: targetId, p_reason: reason ?? null });

// ── Student ID list ─────────────────────────────────────────────────────────
export const getRosterStats = (college) => read("roster_stats", { p_college: college });
export const listRoster = ({ college, status = "all", q = null, page = 1 }) =>
  read("list_student_roster", { p_college: college, p_status: status, p_q: q, p_limit: PAGE_SIZE, p_offset: pageOffset(page) });
export const manageRosterEntry = (id, action, reason) => mutate("manage_roster_entry", { p_id: id, p_action: action, p_reason: reason });
