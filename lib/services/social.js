import "server-only";
import { createClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { dbError, fail, ok } from "@/lib/actions/result";

const CONNECTION_ERRORS = {
  already_connected: "You are already connected.",
  already_requested: "A request is already pending.",
  target_unavailable: "That person is not available.",
  invalid_target: "That is not a valid request.",
  account_restricted: "Your account cannot send requests right now.",
  request_unavailable: "That request is no longer available.",
};

function mapConnectionError(error) {
  const msg = String(error?.message ?? "");
  for (const [key, text] of Object.entries(CONNECTION_ERRORS)) {
    if (msg.includes(key)) return fail(text, { code: key });
  }
  return dbError(error);
}

// ── Connections ─────────────────────────────────────────────────────────────

export async function sendConnectionRequest({ user, recipientId, message }) {
  const limited = await enforceRateLimit("connect", user.id, { limit: 30, windowSec: 3600 });
  if (limited) return limited;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("send_connection_request", { p_recipient: recipientId, p_message: message ?? null });
  if (error) return mapConnectionError(error);
  return ok({ status: data.status });
}

export async function respondToRequest({ requestId, accept }) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("respond_connection_request", { p_id: requestId, p_accept: accept });
  if (error) return mapConnectionError(error);
  return ok({ accepted: accept });
}

export async function cancelRequest({ requestId }) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_connection_request", { p_id: requestId });
  if (error) return mapConnectionError(error);
  return ok();
}

export async function removeConnection({ otherId }) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_connection", { p_other: otherId });
  if (error) return mapConnectionError(error);
  return ok();
}

export async function blockUser({ targetId }) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("block_user", { p_target: targetId });
  if (error) return mapConnectionError(error);
  return ok();
}

export async function unblockUser({ targetId }) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("unblock_user", { p_target: targetId });
  if (error) return dbError(error);
  return ok();
}

export async function setFollow({ user, targetId, follow }) {
  const limited = await enforceRateLimit("follow", user.id, { limit: 60, windowSec: 3600 });
  if (limited) return limited;
  const supabase = await createClient();
  if (follow) {
    const { error } = await supabase
      .from("follows")
      .upsert({ follower_id: user.id, following_id: targetId }, { onConflict: "follower_id,following_id", ignoreDuplicates: true });
    if (error) return dbError(error, "Could not follow right now.");
  } else {
    const { error } = await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", targetId);
    if (error) return dbError(error);
  }
  return ok({ following: follow });
}

// ── Reading ─────────────────────────────────────────────────────────────────

const CARD_FIELDS = "id, username, full_name, avatar_key, headline, account_type, verification_status, college_id, skills, open_to_collaboration, open_to_mentoring, graduation_year";

function toCard(p) {
  return { ...p, verified: p.verification_status === "verified" };
}

export async function getConnections(userId) {
  const supabase = await createClient();
  const { data: rows } = await supabase.from("connections").select("user_a, user_b, created_at").or(`user_a.eq.${userId},user_b.eq.${userId}`).order("created_at", { ascending: false });
  const ids = (rows ?? []).map((r) => (r.user_a === userId ? r.user_b : r.user_a));
  if (!ids.length) return [];
  const { data: people } = await supabase.from("profiles").select(CARD_FIELDS).in("id", ids);
  const byId = new Map((people ?? []).map((p) => [p.id, toCard(p)]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

export async function getRequests(userId) {
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("connection_requests")
    .select("id, requester_id, recipient_id, message, created_at")
    .eq("status", "pending")
    .or(`requester_id.eq.${userId},recipient_id.eq.${userId}`)
    .order("created_at", { ascending: false });
  const ids = [...new Set((rows ?? []).flatMap((r) => [r.requester_id, r.recipient_id]).filter((id) => id !== userId))];
  const { data: people } = ids.length ? await supabase.from("profiles").select(CARD_FIELDS).in("id", ids) : { data: [] };
  const byId = new Map((people ?? []).map((p) => [p.id, toCard(p)]));
  const received = [];
  const sent = [];
  for (const r of rows ?? []) {
    if (r.recipient_id === userId) received.push({ ...r, person: byId.get(r.requester_id) ?? null });
    else sent.push({ ...r, person: byId.get(r.recipient_id) ?? null });
  }
  return { received, sent };
}

export async function getSuggestedPeople(limit = 6) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("suggested_people", { p_limit: limit });
  return data ?? [];
}

export async function getBlockedUsers(userId) {
  const supabase = await createClient();
  const { data: rows } = await supabase.from("user_blocks").select("blocked_id, created_at").eq("blocker_id", userId).order("created_at", { ascending: false });
  const ids = (rows ?? []).map((r) => r.blocked_id);
  if (!ids.length) return [];
  // Blocked people are hidden by profile RLS, so use the minimal card via the admin-free RPC-less path:
  // show what we can (username/name) when visible, otherwise a generic label.
  const { data: people } = await supabase.from("profiles").select("id, username, full_name, avatar_key").in("id", ids);
  const byId = new Map((people ?? []).map((p) => [p.id, p]));
  return ids.map((id) => byId.get(id) ?? { id, username: null, full_name: "Blocked member", avatar_key: null });
}

/** How the viewer relates to a profile: none | self | connected | pending_sent | pending_received. */
export async function getRelationship(viewerId, targetId) {
  if (!viewerId) return { state: "anonymous", following: false, blocked: false };
  if (viewerId === targetId) return { state: "self", following: false, blocked: false };
  const supabase = await createClient();
  const [conn, req, follow, block] = await Promise.all([
    supabase.from("connections").select("user_a").eq("user_a", viewerId < targetId ? viewerId : targetId).eq("user_b", viewerId < targetId ? targetId : viewerId).maybeSingle(),
    supabase
      .from("connection_requests")
      .select("id, requester_id")
      .eq("status", "pending")
      .or(`and(requester_id.eq.${viewerId},recipient_id.eq.${targetId}),and(requester_id.eq.${targetId},recipient_id.eq.${viewerId})`)
      .maybeSingle(),
    supabase.from("follows").select("follower_id").eq("follower_id", viewerId).eq("following_id", targetId).maybeSingle(),
    supabase.from("user_blocks").select("blocker_id").eq("blocker_id", viewerId).eq("blocked_id", targetId).maybeSingle(),
  ]);
  let state = "none";
  let requestId = null;
  if (conn.data) state = "connected";
  else if (req.data) {
    requestId = req.data.id;
    state = req.data.requester_id === viewerId ? "pending_sent" : "pending_received";
  }
  return { state, requestId, following: Boolean(follow.data), blocked: Boolean(block.data) };
}

// ── Search ──────────────────────────────────────────────────────────────────

export async function searchPeople({ query, collegeId = null, accountType = null, skills = null, openToCollab = null, openToMentoring = null, limit = 20, offset = 0 }) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_people", {
    p_query: query || null,
    p_college: collegeId,
    p_account_type: accountType,
    p_skills: skills,
    p_open_to_collab: openToCollab,
    p_open_to_mentoring: openToMentoring,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) {
    console.error("[search] people failed:", error.message);
    return [];
  }
  return data ?? [];
}

export async function searchPostsFts({ query, category = null, limit = 20, offset = 0 }) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_posts", { p_query: query, p_category: category, p_limit: limit, p_offset: offset });
  if (error) {
    console.error("[search] posts failed:", error.message);
    return [];
  }
  return data ?? [];
}
