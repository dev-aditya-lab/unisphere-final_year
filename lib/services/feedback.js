import "server-only";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { dbError, fail, ok } from "@/lib/actions/result";
import { APP_VERSION } from "@/lib/version";

const ERRORS = {
  rate_limited: "You have sent a lot today. Please try again tomorrow.",
  duplicate_submission: "You already sent something with that title today.",
  account_restricted: "Your account cannot send feedback right now.",
  invalid_text: "Please check the title and description.",
  not_found: "That idea is not open for voting.",
  forbidden: "You do not have permission to do that.",
  invalid_duplicate: "Choose the original request this one duplicates.",
  reason_required: "Please explain the decision so the member understands.",
  invalid_release: "That release does not exist.",
  version_exists: "A release with that version already exists.",
  already_published: "Published releases cannot be deleted. Edit them instead.",
  invalid_items: "The list of changes is not valid.",
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

/** Everything a developer needs to reproduce a bug, collected without asking the member to fill in anything. */
async function buildContext(clientContext) {
  const h = await headers();
  return {
    path: clientContext?.path && clientContext.path.startsWith("/") ? clientContext.path.slice(0, 200) : undefined,
    standalone: clientContext?.standalone,
    viewport: clientContext?.viewport,
    app_version: APP_VERSION,
    user_agent: (h.get("user-agent") ?? "").slice(0, 200) || undefined,
  };
}

export async function submitFeedback({ userId, input }) {
  const limited = await enforceRateLimit("feedback", userId, { limit: 10, windowSec: 3600 });
  if (limited) return limited;
  const res = await rpc("submit_feedback", {
    p_kind: input.kind,
    p_title: input.title,
    p_body: input.body,
    p_severity: input.kind === "bug" ? (input.severity ?? "medium") : null,
    p_area: input.area,
    p_context: await buildContext(input.context),
  });
  return res.ok ? ok({ id: res.data, kind: input.kind }) : res;
}

export const toggleVote = (id) => rpc("toggle_feedback_vote", { p_item: id });

/** The idea board for the member's college (RLS decides what is visible), with their own votes marked. */
export async function listIdeas({ sort = "top", area = null, status = "open" } = {}) {
  const supabase = await createClient();
  let q = supabase
    .from("feedback_items")
    .select("id, title, body, status, area, vote_count, public_response, created_at, user_id, author:profiles!feedback_items_user_id_fkey(full_name)")
    .eq("kind", "feature").eq("is_public", true).neq("status", "duplicate")
    .limit(100);
  if (status === "open") q = q.in("status", ["new", "triaged", "planned", "in_progress"]);
  else if (status === "shipped") q = q.eq("status", "shipped");
  if (area) q = q.eq("area", area);
  q = sort === "new" ? q.order("created_at", { ascending: false }) : q.order("vote_count", { ascending: false }).order("created_at", { ascending: false });
  const [{ data: items }, { data: votes }] = await Promise.all([q, supabase.from("feedback_votes").select("item_id")]);
  const voted = new Set((votes ?? []).map((v) => v.item_id));
  return (items ?? []).map((i) => ({ ...i, voted: voted.has(i.id), firstName: i.author?.full_name?.split(" ")[0] ?? "A member" }));
}

export async function listMine(userId) {
  const { data } = await (await createClient())
    .from("feedback_items")
    .select("id, kind, title, status, vote_count, public_response, created_at")
    .eq("user_id", userId).order("created_at", { ascending: false }).limit(50);
  return data ?? [];
}

export async function getRoadmap() {
  const { data } = await (await createClient()).rpc("public_roadmap");
  return data ?? [];
}

export async function listReleases() {
  const { data } = await (await createClient()).from("releases").select("id, version, title, summary, items, published_at").not("published_at", "is", null).lte("published_at", new Date().toISOString()).order("published_at", { ascending: false }).order("version", { ascending: false });
  return data ?? [];
}

// ── Product team ────────────────────────────────────────────────────────────
export async function adminListFeedback({ kind = null, status = null, q = null, page = 1 }) {
  const { data, error } = await (await createClient()).rpc("admin_list_feedback", { p_kind: kind, p_status: status, p_q: q, p_limit: 25, p_offset: (Math.max(1, page) - 1) * 25 });
  if (error) throw new Error(`feedback list failed: ${error.message}`);
  return data ?? [];
}
export const triageFeedback = (d) => rpc("triage_feedback", { p_id: d.id, p_status: d.status, p_response: d.response ?? null, p_public: d.isPublic ?? null, p_duplicate_of: d.duplicateOf ?? null, p_release: d.releaseId ?? null });

export async function adminListReleases() {
  const { data } = await (await createClient()).from("releases").select("id, version, title, summary, items, published_at, created_at").order("created_at", { ascending: false }).limit(100);
  return data ?? [];
}
export const saveRelease = (d) => rpc("save_release", { p_id: d.id ?? null, p_version: d.version, p_title: d.title, p_summary: d.summary ?? null, p_items: d.items, p_publish: d.publish });
export const deleteRelease = (id) => rpc("delete_release", { p_id: id });
