import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { fail, ok } from "@/lib/actions/result";

/**
 * Community channels, messages, roles, invitations, reports and appeals.
 *
 * Every call runs as the signed-in member (their own Supabase client), so row level security answers "may they see
 * this", and every write is a database function that answers "may they do this" itself. Nothing here decides
 * authorisation; this file maps the database's answers to messages a person can read and shapes rows for the client.
 */

// ── Errors ──────────────────────────────────────────────────────────────────

const ERRORS = {
  not_authenticated: "Please log in.",
  not_found: "That is not available.",
  not_a_member: "Join the community first.",
  forbidden: "You do not have permission to do that.",
  read_only: "You cannot post in this channel.",
  archived: "This channel is archived.",
  timed_out: "A moderator has timed you out for now.",
  rules_required: "Accept the community rules first.",
  account_restricted: "Your account cannot do that right now.",
  empty_message: "Write a message first (up to 4,000 characters).",
  too_many_files: "You can attach up to 5 files to a message.",
  invalid_file: "One of the files could not be attached. Upload it again.",
  attachments_disabled: "Files are turned off in this channel.",
  invalid_reply: "The message you replied to is not in this channel.",
  rate_limited: "You are going a little fast. Wait a moment and try again.",
  limit_reached: "You have reached the limit for that.",
  name_taken: "A channel with that name already exists.",
  invalid_image: "That image cannot be used. Upload it again.",
  invalid_proportions: "That picture does not have the right proportions. Crop it again.",
  invalid_kind: "Choose an icon or a banner.",
  college_required: "To show this community to “My college”, its creator needs a college on their profile.",
  invite_invalid: "That invite link is not valid any more.",
  invite_only: "This community is invite-only.",
  banned: "You cannot join this community.",
  community_unavailable: "That community is not available.",
  owner_cannot_leave: "The owner cannot leave. Hand the community to someone else first, or delete it.",
  invalid_invitee: "You cannot invite that person.",
  invalid_target: "You cannot do that to that person.",
  invalid_role: "Choose a valid role.",
  invalid_action: "Choose a valid action.",
  invalid_duration: "Choose how long (1 hour to 28 days).",
  invalid_status: "Choose a valid status.",
  invalid_decision: "Choose a decision.",
  invalid_level: "Choose a valid setting.",
  confirmation_mismatch: "The confirmation did not match. Nothing changed.",
  reason_required: "Give a reason (at least 3 characters). The person will see it.",
  already_appealed: "You have already appealed this decision.",
  appeal_window_closed: "Appeals are open for 30 days after a decision.",
  message_too_short: "Tell the reviewers a little more (at least 10 characters).",
  already_closed: "That report is already closed.",
};

/** Postgres error from a community function -> { code, message, status, retryAfter? }. */
export function mapRpcError(error) {
  const text = String(error?.message ?? "");
  const slow = text.match(/slow_mode:(\d+)/);
  if (slow) return { code: "slow_mode", message: `Slow mode is on. You can post again in ${slow[1]} second${slow[1] === "1" ? "" : "s"}.`, status: 429, retryAfter: Number(slow[1]) };
  for (const [code, message] of Object.entries(ERRORS)) {
    if (text.includes(code)) {
      const status = code === "rate_limited" ? 429 : code === "not_found" || code === "community_unavailable" ? 404 : code === "not_authenticated" ? 401 : code === "forbidden" || code === "read_only" || code === "timed_out" ? 403 : 400;
      return { code, message, status };
    }
  }
  if (error?.code === "23505") return { code: "duplicate", message: "That already exists.", status: 409 };
  if (error?.code === "22023" || error?.code === "23514") return { code: "invalid", message: "That is not allowed.", status: 400 };
  return { code: "unavailable", message: "Something went wrong. Please try again.", status: 503 };
}

const failure = (error) => {
  const e = mapRpcError(error);
  return fail(e.message, { code: e.code, status: e.status, ...(e.retryAfter ? { retryAfter: e.retryAfter } : {}) });
};

async function rpc(name, args) {
  const { data, error } = await (await createClient()).rpc(name, args);
  return error ? failure(error) : ok({ data });
}

// ── Shapes ──────────────────────────────────────────────────────────────────

const PERSON = "id, username, full_name, avatar_key";
const unknownPerson = (id) => ({ id: id ?? null, full_name: "UniSphere member", username: null, avatar_key: null });

/** A message as the client receives it. A deleted or removed message carries no text and no files. */
export function toWire(row) {
  const gone = row.status !== "sent";
  return {
    id: row.id,
    channel_id: row.channel_id,
    author_id: row.author_id ?? null,
    body: gone ? "" : row.body ?? "",
    reply_to_id: row.reply_to_id ?? null,
    status: row.status,
    pinned_at: gone ? null : row.pinned_at ?? null,
    edited_at: row.edited_at ?? null,
    created_at: row.created_at,
    client_op_id: row.client_op_id ?? null,
    mentions: gone || !Array.isArray(row.mentions) ? [] : row.mentions,
    attachments: gone || !Array.isArray(row.attachments)
      ? []
      : row.attachments.map((a) => ({ id: a.id, original_name: a.original_name ?? null, mime_type: a.mime_type ?? null, size: a.size ?? null, width: a.width ?? null, height: a.height ?? null })),
  };
}

/** { id: person } for the given ids. A profile the viewer may not see comes back as "UniSphere member", as everywhere else. */
export async function loadPeople(ids) {
  const unique = [...new Set((ids ?? []).filter(Boolean))].slice(0, 200);
  const people = {};
  if (unique.length) {
    const { data } = await (await createClient()).from("profiles").select(PERSON).in("id", unique);
    for (const p of data ?? []) people[p.id] = p;
  }
  for (const id of unique) people[id] ??= unknownPerson(id);
  return people;
}

// ── Reads ───────────────────────────────────────────────────────────────────

const CHANNEL_COLUMNS = "id, community_id, category_id, name, type, description, topic, rules, position, min_view_role, min_post_role, slow_mode_seconds, allow_attachments, archived_at";

/** Everything the channel sidebar needs, in one parallel round: null when the community does not exist for this viewer. */
export const getWorkspace = cache(async (slug, userId) => {
  const supabase = await createClient();
  const { data: community } = await supabase.from("community_cards").select("*").eq("slug", slug).maybeSingle();
  if (!community) return null;
  if (community.my_status !== "active") return { community, me: null, categories: [], channels: [], unread: {}, prefs: [] };
  const [categories, channels, unread, prefs, me] = await Promise.all([
    supabase.from("community_categories").select("id, name, position, archived_at").eq("community_id", community.id).order("position").order("created_at"),
    supabase.from("community_channels").select(CHANNEL_COLUMNS).eq("community_id", community.id).order("position").order("created_at"),
    supabase.rpc("community_channel_unread", { p_community: community.id }),
    supabase.from("community_notify_prefs").select("channel_id, level, muted_until").eq("community_id", community.id),
    supabase.from("community_members").select("role, status, muted_until, rules_ack_at").eq("community_id", community.id).eq("user_id", userId).maybeSingle(),
  ]);
  return {
    community,
    me: me.data ?? null,
    categories: categories.data ?? [],
    channels: channels.data ?? [],
    unread: Object.fromEntries((unread.data ?? []).map((r) => [r.channel_id, { unread: Number(r.unread), mentions: Number(r.mentions) }])),
    prefs: prefs.data ?? [],
  };
});

/** One channel, whether the viewer may post in it right now ('ok' or the reason), and where they stopped reading. Null when it is not visible. */
export async function getChannel(channelId, userId = null) {
  const supabase = await createClient();
  const [{ data: channel }, state, read] = await Promise.all([
    supabase.from("community_channels").select(CHANNEL_COLUMNS).eq("id", channelId).maybeSingle(),
    supabase.rpc("channel_post_state", { p_channel: channelId }),
    userId ? supabase.from("channel_reads").select("last_read_at").eq("channel_id", channelId).eq("user_id", userId).maybeSingle() : { data: null },
  ]);
  if (!channel) return null;
  return { ...channel, postState: state.data ?? "not_found", lastReadAt: read.data?.last_read_at ?? null };
}

/**
 * A page of one channel: newest first by default, `before` for older, `after` for catching up. Also the people who wrote
 * the messages and a short preview of any message replied to that is not in the page. A channel the viewer cannot see
 * returns an empty page.
 */
export async function getChannelPage(channelId, { before = null, after = null, limit = 40 } = {}) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("channel_messages_page", {
    p_channel: channelId,
    p_before_ts: before?.ts ?? null, p_before_id: before?.id ?? null,
    p_after_ts: after?.ts ?? null, p_after_id: after?.id ?? null,
    p_limit: Math.min(Math.max(limit, 1), 100),
  });
  if (error) throw error;
  const rows = data ?? [];
  const inPage = new Set(rows.map((r) => r.id));
  const missing = [...new Set(rows.map((r) => r.reply_to_id).filter((x) => x && !inPage.has(x)))].slice(0, 50);
  const [people, refRows] = await Promise.all([
    loadPeople(rows.map((r) => r.author_id)),
    missing.length ? supabase.from("channel_messages").select("id, author_id, body, status").in("id", missing) : { data: [] },
  ]);
  const refs = {};
  for (const r of refRows.data ?? []) refs[r.id] = { id: r.id, author_id: r.author_id, status: r.status, body: r.status === "sent" ? r.body.slice(0, 140) : "" };
  const items = rows.map(toWire);
  const hasMore = !after && items.length === Math.min(Math.max(limit, 1), 100);
  return { items: after ? items : items.reverse(), hasMore, people, refs };
}

export async function getPinned(channelId) {
  const supabase = await createClient();
  const { data } = await supabase.from("channel_messages").select("id, channel_id, author_id, body, reply_to_id, attachments, mentions, status, pinned_at, edited_at, created_at")
    .eq("channel_id", channelId).eq("status", "sent").not("pinned_at", "is", null).order("pinned_at", { ascending: false }).limit(50);
  const items = (data ?? []).map(toWire);
  return { items, people: await loadPeople(items.map((m) => m.author_id)) };
}

export async function searchMessages(communityId, query, { channelId = null } = {}) {
  const { data, error } = await (await createClient()).rpc("search_channel_messages", { p_community: communityId, p_query: query, p_limit: 25, p_channel: channelId });
  if (error) return failure(error);
  const people = await loadPeople((data ?? []).map((r) => r.author_id));
  return ok({ results: data ?? [], people });
}

/** Members, searchable and paged. Staff also see pending and banned people (row level security decides, not this code). */
export async function listMembers(communityId, { query = "", status = "active", page = 0, pageSize = 30 } = {}) {
  const supabase = await createClient();
  let ids = null;
  const q = String(query ?? "").trim().replace(/[%_\\,()]/g, " ").slice(0, 40);
  if (q) {
    const { data } = await supabase.from("profiles").select("id").or(`full_name.ilike.%${q}%,username.ilike.%${q}%`).limit(100);
    ids = (data ?? []).map((p) => p.id);
    if (ids.length === 0) return { members: [], hasMore: false };
  }
  let req = supabase.from("community_members").select("user_id, role, status, joined_at, muted_until").eq("community_id", communityId).eq("status", status)
    .order("joined_at").range(page * pageSize, page * pageSize + pageSize);
  if (ids) req = req.in("user_id", ids);
  const { data } = await req;
  const rows = data ?? [];
  const hasMore = rows.length > pageSize;
  const slice = rows.slice(0, pageSize);
  const people = await loadPeople(slice.map((r) => r.user_id));
  return { members: slice.map((r) => ({ ...r, person: people[r.user_id] })), hasMore };
}

export async function countPending(communityId) {
  const { count } = await (await createClient()).from("community_members").select("user_id", { count: "exact", head: true }).eq("community_id", communityId).eq("status", "pending");
  return count ?? 0;
}

export async function listInvites(communityId) {
  const { data } = await (await createClient()).from("community_invites")
    .select("id, code_hint, created_by, invitee_id, note, expires_at, max_uses, uses, revoked_at, created_at").eq("community_id", communityId).order("created_at", { ascending: false }).limit(50);
  return data ?? [];
}

export async function listReports(communityId, { status = "open" } = {}) {
  const supabase = await createClient();
  let req = supabase.from("community_reports").select("id, reporter_id, target_type, target_id, target_user_id, channel_id, category, details, severity, status, snapshot, resolution, escalated_at, created_at, resolved_at")
    .eq("community_id", communityId).order("created_at", { ascending: false }).limit(50);
  req = status === "open" ? req.in("status", ["open", "reviewing"]) : status === "all" ? req : req.eq("status", status);
  const { data } = await req;
  const rows = data ?? [];
  const people = await loadPeople(rows.flatMap((r) => [r.reporter_id, r.target_user_id]));
  return rows.map((r) => ({ ...r, reporter: people[r.reporter_id] ?? null, target: people[r.target_user_id] ?? null }));
}

/** What staff did in this community (private notes included: row level security hides them from the people they are about). */
export async function listModActions(communityId) {
  const { data } = await (await createClient()).from("community_mod_actions").select("id, actor_id, target_user_id, action, reason, expires_at, created_at, report_id")
    .eq("community_id", communityId).order("created_at", { ascending: false }).limit(60);
  const rows = data ?? [];
  const people = await loadPeople(rows.flatMap((r) => [r.actor_id, r.target_user_id]));
  return rows.map((r) => ({ ...r, actor: people[r.actor_id] ?? null, target: people[r.target_user_id] ?? null }));
}

/** What was done to the signed-in member in this community, and the appeal state of each decision. */
export async function listMyDecisions(communityId, userId) {
  const supabase = await createClient();
  const { data } = await supabase.from("community_mod_actions").select("id, action, reason, expires_at, created_at")
    .eq("community_id", communityId).eq("target_user_id", userId).neq("action", "note").order("created_at", { ascending: false }).limit(20);
  const rows = data ?? [];
  const { data: appeals } = rows.length ? await supabase.from("community_appeals").select("action_id, status, review_note").in("action_id", rows.map((r) => r.id)) : { data: [] };
  const byAction = new Map((appeals ?? []).map((a) => [a.action_id, a]));
  return rows.map((r) => ({ ...r, appeal: byAction.get(r.id) ?? null }));
}

export async function listAppeals(communityId) {
  const supabase = await createClient();
  const { data } = await supabase.from("community_appeals").select("id, action_id, user_id, message, status, review_note, created_at, escalated_at").eq("community_id", communityId).order("created_at", { ascending: false }).limit(30);
  const rows = data ?? [];
  const { data: actions } = rows.length ? await supabase.from("community_mod_actions").select("id, action, reason, actor_id").in("id", rows.map((r) => r.action_id)) : { data: [] };
  const byId = new Map((actions ?? []).map((a) => [a.id, a]));
  const people = await loadPeople(rows.map((r) => r.user_id));
  return rows.map((r) => ({ ...r, action: byId.get(r.action_id) ?? null, user: people[r.user_id] ?? null }));
}

export async function listAudit(communityId, { before = null } = {}) {
  const supabase = await createClient();
  let req = supabase.from("community_audit_log").select("id, actor_id, action, target_type, target_id, details, created_at").eq("community_id", communityId).order("id", { ascending: false }).limit(50);
  if (before) req = req.lt("id", before);
  const { data } = await req;
  const rows = data ?? [];
  const people = await loadPeople(rows.map((r) => r.actor_id));
  return rows.map((r) => ({ ...r, actor: people[r.actor_id] ?? null }));
}

/** Communities to discover: public and college-visible ones the viewer is not already in, by topic or words. */
export async function discoverCommunities({ query = "", topic = "", limit = 24 } = {}) {
  const supabase = await createClient();
  let req = supabase.from("community_cards").select("id, slug, name, kind, description, avatar_key, cover_key, member_count, topics, is_official, join_policy, visibility, my_status")
    .neq("visibility", "private").order("is_official", { ascending: false }).order("member_count", { ascending: false }).limit(limit);
  if (topic && /^[a-z0-9][a-z0-9-]{0,29}$/.test(topic)) req = req.contains("topics", [topic]);
  const q = String(query ?? "").trim().replace(/[%_\\,()]/g, " ").slice(0, 60);
  if (q) req = req.ilike("name", `%${q}%`);
  const { data } = await req;
  return data ?? [];
}

// ── Writes: structure ───────────────────────────────────────────────────────

export const createCategory = ({ communityId, name }) => rpc("create_community_category", { p_community: communityId, p_name: name });
export const updateCategory = ({ categoryId, name, archived = null }) => rpc("update_community_category", { p_category: categoryId, p_name: name ?? null, p_archived: archived });
export const reorderCategories = ({ communityId, ids }) => rpc("reorder_community_categories", { p_community: communityId, p_ids: ids });
export const createChannel = ({ communityId, input }) => rpc("create_community_channel", {
  p_community: communityId, p_category: input.categoryId ?? null, p_name: input.name, p_type: input.type, p_description: input.description ?? null, p_topic: input.topic ?? null,
  p_rules: input.rules ?? null, p_min_view_role: input.minViewRole, p_min_post_role: input.minPostRole, p_slow_mode: input.slowModeSeconds, p_allow_attachments: input.allowAttachments,
});
export const updateChannel = ({ channelId, input, archived = null }) => rpc("update_community_channel", {
  p_channel: channelId, p_name: input.name, p_category: input.categoryId ?? null, p_description: input.description ?? null, p_topic: input.topic ?? null, p_rules: input.rules ?? null,
  p_min_view_role: input.minViewRole, p_min_post_role: input.minPostRole, p_slow_mode: input.slowModeSeconds, p_allow_attachments: input.allowAttachments, p_archived: archived,
});
export const reorderChannels = ({ communityId, ids }) => rpc("reorder_community_channels", { p_community: communityId, p_ids: ids });
export const moveChannel = ({ channelId, categoryId }) => rpc("move_community_channel", { p_channel: channelId, p_category: categoryId ?? null });

export const setBranding = ({ communityId, kind, fileId }) => rpc("set_community_branding", { p_community: communityId, p_kind: kind, p_file: fileId ?? null });
export async function updateDetails({ communityId, input }) {
  const res = await rpc("update_community_details", {
    p_community: communityId, p_name: input.name, p_kind: input.kind, p_description: input.description ?? null, p_visibility: input.visibility, p_join_policy: input.joinPolicy,
    p_rules: input.rules ?? null, p_topics: input.topics, p_require_rules_ack: input.requireRulesAck, p_invite_policy: input.invitePolicy,
  });
  return res.ok ? ok({ slug: res.data }) : res;
}
export const acknowledgeRules = (communityId) => rpc("acknowledge_community_rules", { p_community: communityId });

// ── Writes: messages ────────────────────────────────────────────────────────

export async function sendMessage({ channelId, body, fileIds, replyTo, clientOpId }) {
  const res = await rpc("send_channel_message", { p_channel: channelId, p_body: body, p_file_ids: fileIds, p_reply_to: replyTo ?? null, p_client_op_id: clientOpId });
  return res.ok ? ok({ message: toWire(res.data.message), replayed: Boolean(res.data.replayed) }) : res;
}
export async function editMessage({ messageId, body }) {
  const res = await rpc("edit_channel_message", { p_message: messageId, p_body: body });
  return res.ok ? ok({ message: toWire(res.data) }) : res;
}
export const deleteMessage = ({ messageId, reason = null, reportId = null }) => rpc("delete_channel_message", { p_message: messageId, p_reason: reason, p_report: reportId });
export const pinMessage = ({ messageId, pinned }) => rpc("pin_channel_message", { p_message: messageId, p_pinned: pinned });
export const markRead = (channelId) => rpc("mark_channel_read", { p_channel: channelId });
export const setNotifyPref = ({ communityId, channelId = null, level, muteHours = null }) =>
  rpc("set_community_notify_pref", { p_community: communityId, p_channel: channelId, p_level: level, p_mute_hours: muteHours });

// ── Writes: people ──────────────────────────────────────────────────────────

export const createInvite = ({ communityId, hours, maxUses, inviteeId, note }) =>
  rpc("create_community_invite", { p_community: communityId, p_hours: hours, p_max_uses: maxUses ?? null, p_invitee: inviteeId ?? null, p_note: note ?? null });
export const revokeInvite = (inviteId) => rpc("revoke_community_invite", { p_invite: inviteId });
export const previewInvite = (code) => rpc("preview_community_invite", { p_code: code });
export const redeemInvite = (code) => rpc("redeem_community_invite", { p_code: code });
export const setMemberRole = ({ communityId, userId, role }) => rpc("set_community_member_role", { p_community: communityId, p_user: userId, p_role: role });
export const transferOwnership = ({ communityId, userId, confirm }) => rpc("transfer_community_ownership", { p_community: communityId, p_user: userId, p_confirm: confirm });
export const moderateMember = ({ communityId, userId, action, reason, hours, reportId }) =>
  rpc("moderate_member", { p_community: communityId, p_user: userId, p_action: action, p_reason: reason ?? null, p_hours: hours ?? null, p_report: reportId ?? null });

// ── Writes: reports and appeals ─────────────────────────────────────────────

export const submitReport = ({ communityId, targetType, targetId, category, details }) =>
  rpc("submit_community_report", { p_community: communityId, p_target_type: targetType, p_target_id: targetId, p_category: category, p_details: details ?? null });
export const updateReport = ({ reportId, status, resolution }) => rpc("update_community_report", { p_report: reportId, p_status: status, p_resolution: resolution ?? null });
export const escalateReport = (reportId) => rpc("escalate_community_report", { p_report: reportId });
export const submitAppeal = ({ actionId, message }) => rpc("submit_community_appeal", { p_action: actionId, p_message: message });
export const reviewAppeal = ({ appealId, decision, note }) => rpc("review_community_appeal", { p_appeal: appealId, p_decision: decision, p_note: note ?? null });

// ── Platform administration (each function checks the staff permission itself) ─

export const adminOverview = ({ query, offset = 0 }) => rpc("admin_community_overview", { p_query: query || null, p_limit: 30, p_offset: offset });
export const adminDetail = (communityId) => rpc("admin_community_detail", { p_community: communityId });
export const adminEscalatedReports = (status) => rpc("admin_escalated_community_reports", { p_status: status || null });
export const adminResolveReport = ({ reportId, status, resolution, removeMessage }) =>
  rpc("admin_resolve_community_report", { p_report: reportId, p_status: status, p_resolution: resolution ?? null, p_remove_message: Boolean(removeMessage) });
export const adminEscalatedAppeals = () => rpc("admin_escalated_community_appeals", {});
export const adminReviewAppeal = ({ appealId, decision, note }) => rpc("admin_review_community_appeal", { p_appeal: appealId, p_decision: decision, p_note: note ?? null });
export const adminTrends = (days = 14) => rpc("admin_community_trends", { p_days: days });
export const adminHealth = () => rpc("admin_community_health", {});
