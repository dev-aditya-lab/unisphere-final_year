import "server-only";
import { createClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { dbError, fail, ok } from "@/lib/actions/result";
import { uniqueSlug } from "@/lib/slug";
import { zonedLocalToUtcIso } from "@/lib/time";

const ERRORS = {
  community_unavailable: "That community is not available.",
  banned: "You cannot join this community.",
  invite_only: "This community is invite-only.",
  owner_cannot_leave: "The owner cannot leave. Delete the community or hand it over first.",
  forbidden: "You do not have permission to do that.",
  event_unavailable: "That event is not available.",
  event_cancelled: "This event was cancelled.",
  event_over: "This event has already ended.",
  registration_external: "Registration for this event happens on an external page.",
  not_a_member: "Only community members can post there.",
  not_community_admin: "Only community admins can create events for a community.",
  account_restricted: "Your account cannot do that right now.",
  not_found: "Not found.",
};
function rpcFail(error) {
  const msg = String(error?.message ?? "");
  for (const [k, text] of Object.entries(ERRORS)) if (msg.includes(k)) return fail(text, { code: k });
  return dbError(error);
}
async function rpc(name, args) {
  const { data, error } = await (await createClient()).rpc(name, args);
  return error ? rpcFail(error) : ok({ data });
}

async function insertWithSlug(table, row, source, select = "id, slug") {
  const supabase = await createClient();
  for (let i = 0; i < 3; i++) {
    const { data, error } = await supabase.from(table).insert({ ...row, slug: uniqueSlug(source, { fallback: table }) }).select(select).single();
    if (!error) return { data };
    if (!(error.code === "23505" && String(error.message).includes("slug"))) return { error };
  }
  return { error: { message: "slug_collision" } };
}

// ── Communities ─────────────────────────────────────────────────────────────

export async function listCommunities({ query = null, kind = null, topic = null, mine = false, userId = null } = {}) {
  const supabase = await createClient();
  let q = supabase.from("community_cards").select("*").order("is_official", { ascending: false }).order("member_count", { ascending: false }).limit(60);
  if (kind) q = q.eq("kind", kind);
  if (topic && /^[a-z0-9][a-z0-9-]{0,29}$/.test(topic)) q = q.contains("topics", [topic]);
  if (query) q = q.ilike("name", `%${query.replace(/[%_\\]/g, "\\$&")}%`);
  if (mine && userId) q = q.eq("my_status", "active");
  const { data } = await q;
  return data ?? [];
}

export async function getCommunityBySlug(slug) {
  const { data } = await (await createClient()).from("community_cards").select("*").eq("slug", slug).maybeSingle();
  return data ?? null;
}

export async function getCommunityMembers(communityId, { includePending = false } = {}) {
  const supabase = await createClient();
  let q = supabase.from("community_members").select("user_id, role, status, joined_at").eq("community_id", communityId).order("joined_at").limit(200);
  if (!includePending) q = q.eq("status", "active");
  const { data: rows } = await q;
  const ids = (rows ?? []).map((r) => r.user_id);
  const { data: people } = ids.length ? await supabase.from("profiles").select("id, username, full_name, avatar_key, headline").in("id", ids) : { data: [] };
  const byId = new Map((people ?? []).map((p) => [p.id, p]));
  return (rows ?? []).map((r) => ({ ...r, person: byId.get(r.user_id) ?? { id: r.user_id, full_name: "UniSphere member", username: null, avatar_key: null } }));
}

export async function getCommunityPosts(communityId, limit = 20) {
  const { data } = await (await createClient()).from("post_feed").select("*").eq("community_id", communityId).eq("status", "published").order("created_at", { ascending: false }).limit(limit);
  return data ?? [];
}

export async function createCommunity({ user, input }) {
  const limited = await enforceRateLimit("community-create", user.id, { limit: 5, windowSec: 3600 });
  if (limited) return limited;
  const { data, error } = await insertWithSlug("communities", {
    created_by: user.id, name: input.name, kind: input.kind, description: input.description ?? null, visibility: input.visibility, join_policy: input.joinPolicy,
  }, input.name);
  return error ? dbError(error, "Could not create the community.") : ok({ slug: data.slug, id: data.id });
}

export const joinCommunity = (communityId) => rpc("join_community", { p_community: communityId });
export const leaveCommunity = (communityId) => rpc("leave_community", { p_community: communityId });
export const respondMembership = ({ communityId, userId, accept }) => rpc("respond_community_membership", { p_community: communityId, p_user: userId, p_accept: accept });
export const setCommunityOfficial = ({ communityId, official }) => rpc("set_community_official", { p_community: communityId, p_official: official });
export const deleteCommunity = (communityId) => rpc("delete_community", { p_community: communityId });

// ── Events ──────────────────────────────────────────────────────────────────

function eventRow(input) {
  return {
    title: input.title, description: input.description ?? null, kind: input.kind, timezone: input.timezone,
    starts_at: zonedLocalToUtcIso(input.startsLocal, input.timezone),
    ends_at: input.endsLocal ? zonedLocalToUtcIso(input.endsLocal, input.timezone) : null,
    mode: input.mode, location: input.location ?? null, online_url: input.onlineUrl ?? null,
    registration_mode: input.registrationMode, registration_url: input.registrationUrl ?? null,
    capacity: input.capacity ?? null, visibility: input.visibility,
  };
}

export async function listEvents({ scope = "upcoming", query = null, kind = null, mode = null, userId = null, limit = 30 } = {}) {
  const supabase = await createClient();
  const now = new Date().toISOString();
  let q = supabase.from("event_cards").select("*").limit(limit);
  if (scope === "past") q = q.lt("starts_at", now).order("starts_at", { ascending: false });
  else q = q.gte("starts_at", new Date(Date.now() - 3 * 3600_000).toISOString()).order("starts_at", { ascending: true });
  if (kind) q = q.eq("kind", kind);
  if (mode) q = q.eq("mode", mode);
  if (query) q = q.ilike("title", `%${query.replace(/[%_\\]/g, "\\$&")}%`);
  const { data } = await q;
  let rows = data ?? [];
  if (scope === "mine" && userId) rows = rows.filter((e) => ["going", "interested", "waitlist"].includes(e.my_status) || e.organizer_id === userId);
  return rows;
}

export async function getEventBySlug(slug) {
  const { data } = await (await createClient()).from("event_cards").select("*").eq("slug", slug).maybeSingle();
  return data ?? null;
}

export async function getEventAttendees(eventId) {
  const supabase = await createClient();
  const { data: rows } = await supabase.from("event_registrations").select("user_id, status, attended, updated_at").eq("event_id", eventId).in("status", ["going", "waitlist", "interested"]).order("updated_at").limit(500);
  const ids = (rows ?? []).map((r) => r.user_id);
  const { data: people } = ids.length ? await supabase.from("profiles").select("id, username, full_name, avatar_key").in("id", ids) : { data: [] };
  const byId = new Map((people ?? []).map((p) => [p.id, p]));
  return (rows ?? []).map((r) => ({ ...r, person: byId.get(r.user_id) ?? { id: r.user_id, full_name: "UniSphere member" } }));
}

export async function createEvent({ user, input }) {
  const limited = await enforceRateLimit("event-create", user.id, { limit: 10, windowSec: 3600 });
  if (limited) return limited;
  const { data, error } = await insertWithSlug("events", { ...eventRow(input), organizer_id: user.id, community_id: input.communityId ?? null }, input.title);
  return error ? rpcFail(error) : ok({ slug: data.slug, id: data.id });
}

export async function updateEvent({ eventId, input }) {
  const { data, error } = await (await createClient()).from("events").update(eventRow(input)).eq("id", eventId).select("slug").maybeSingle();
  if (error) return dbError(error);
  return data ? ok({ slug: data.slug }) : fail("You cannot edit this event (it may be cancelled).", { code: "forbidden" });
}

export const rsvp = ({ eventId, status }) => rpc("rsvp_event", { p_event: eventId, p_status: status });
export const markAttendance = ({ eventId, userId, attended }) => rpc("mark_event_attendance", { p_event: eventId, p_user: userId, p_attended: attended });
export const cancelEvent = ({ eventId, reason }) => rpc("cancel_event", { p_event: eventId, p_reason: reason ?? null });
export const deleteEvent = (eventId) => rpc("delete_event", { p_event: eventId });

// ── Opportunities ───────────────────────────────────────────────────────────

function oppRow(input) {
  return {
    title: input.title, organization: input.organization, kind: input.kind, location: input.location ?? null, mode: input.mode,
    apply_url: input.applyUrl ?? null, deadline: input.deadline ?? null, description: input.description ?? null, skills: input.skills,
    stipend: input.stipend ?? null, visibility: input.visibility,
  };
}

export async function listOpportunities({ query = null, kind = null, mode = null, skill = null, openOnly = true, limit = 40 } = {}) {
  const supabase = await createClient();
  let q = supabase.from("opportunities").select("id, slug, title, organization, kind, location, mode, deadline, skills, stipend, status, visibility, created_at, poster_id")
    .is("deleted_at", null).order("created_at", { ascending: false }).limit(limit);
  if (openOnly) q = q.eq("status", "open").or(`deadline.is.null,deadline.gte.${new Date().toISOString().slice(0, 10)}`);
  if (kind) q = q.eq("kind", kind);
  if (mode) q = q.eq("mode", mode);
  if (skill) q = q.contains("skills", [skill]);
  if (query) q = q.textSearch("search_vector", query, { type: "websearch", config: "english" });
  const { data } = await q;
  return data ?? [];
}

export async function getOpportunityBySlug(slug) {
  const supabase = await createClient();
  const { data } = await supabase.from("opportunities").select("*").eq("slug", slug).is("deleted_at", null).maybeSingle();
  if (!data) return null;
  const { data: poster } = await supabase.from("profiles").select("id, username, full_name, avatar_key").eq("id", data.poster_id).maybeSingle();
  return { ...data, poster };
}

export async function createOpportunity({ user, input }) {
  const limited = await enforceRateLimit("opportunity-create", user.id, { limit: 10, windowSec: 3600 });
  if (limited) return limited;
  const { data, error } = await insertWithSlug("opportunities", { ...oppRow(input), poster_id: user.id }, `${input.title} ${input.organization}`);
  return error ? dbError(error, "Could not publish the opportunity.") : ok({ slug: data.slug });
}

export async function updateOpportunity({ id, patch }) {
  const { data, error } = await (await createClient()).from("opportunities").update(patch).eq("id", id).select("slug").maybeSingle();
  if (error) return dbError(error);
  return data ? ok({ slug: data.slug }) : fail("You cannot change this listing.", { code: "forbidden" });
}
export const oppFields = oppRow;

// ── Announcements ───────────────────────────────────────────────────────────

export async function getAnnouncements(limit = 3) {
  const { data } = await (await createClient()).from("college_announcements").select("id, title, body, pinned, published_at").eq("status", "published")
    .order("pinned", { ascending: false }).order("published_at", { ascending: false }).limit(limit);
  return data ?? [];
}
export const publishAnnouncement = ({ collegeId, title, body, pinned, expiresAt }) =>
  rpc("publish_announcement", { p_college: collegeId, p_title: title, p_body: body, p_pinned: pinned, p_expires: expiresAt ? new Date(expiresAt).toISOString() : null });
export const archiveAnnouncement = (id) => rpc("archive_announcement", { p_id: id });
