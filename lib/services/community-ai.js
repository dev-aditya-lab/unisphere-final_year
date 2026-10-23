import "server-only";
import { createClient } from "@/lib/supabase/server";
import { runAiTask } from "@/lib/ai";
import { getSetting } from "@/lib/settings";
import { roleAtLeast } from "@/lib/community/rules";
import { fail, ok } from "@/lib/actions/result";
import { getChannel } from "@/lib/services/community-workspace";

/**
 * AI for communities, only where it saves a person real time, and only on request:
 *  - a summary of what was said in a channel the member can already read;
 *  - a draft of a community's description, rules or a channel description from the organiser's own notes;
 *  - an advisory category/severity suggestion for a moderator looking at a report.
 *
 * What is never sent to a model: private communities, staff-only or restricted channels, direct messages, names, usernames or
 * profile details (members appear as "Member 1", "Member 2"), and anything the requester could not read themselves (the
 * channel is fetched under their own row level security first). Member text is wrapped as untrusted data by the prompt, personal
 * data such as emails and phone numbers is masked on the way out, and every answer is validated against a schema and shown as a
 * suggestion: it does not act, and a person decides. The existing per-member consent (ai_assist), daily budget, throttle,
 * timeout and provider fallback all apply (lib/ai/index.js). Nothing is stored on the server; the model provider's handling is
 * described in the privacy notice.
 */

const MIN_MESSAGES = 5;
const WINDOW_DAYS = 14;

/** Public communities, and college ones when the platform allows college-visible text to reach the provider. */
async function communityAllowsAi(communityId) {
  const { data: community } = await (await createClient()).from("community_cards").select("visibility").eq("id", communityId).maybeSingle();
  if (!community) return false;
  if (community.visibility === "public") return true;
  return community.visibility === "college" && (await getSetting("ai_share_college_content")) === true;
}

const BLOCKED = (error) => fail(error, { code: "blocked_input" });

export async function summarizeChannel({ user, channelId }) {
  const channel = await getChannel(channelId, user.id);
  if (!channel) return fail("That channel is not available.", { code: "not_found" });
  if (channel.type === "staff" || channel.min_view_role !== "member" || channel.archived_at) return BLOCKED("This channel cannot be summarised by AI.");
  if (!(await communityAllowsAi(channel.community_id))) return BLOCKED("Messages in this community are not sent to the AI provider, so they cannot be summarised.");

  const supabase = await createClient();
  const { data: rows } = await supabase.rpc("channel_messages_page", { p_channel: channelId, p_limit: 80 });
  const since = Date.now() - WINDOW_DAYS * 24 * 3600 * 1000;
  const recent = (rows ?? []).filter((m) => m.status === "sent" && m.body?.trim() && new Date(m.created_at).getTime() >= since).reverse();
  if (recent.length < MIN_MESSAGES) return fail(`There is not enough to summarise yet (at least ${MIN_MESSAGES} recent messages).`, { code: "too_short" });

  const labels = new Map();
  const label = (id) => {
    if (!labels.has(id)) labels.set(id, `Member ${labels.size + 1}`);
    return labels.get(id);
  };
  const messages = recent.map((m) => `${label(m.author_id ?? "gone")}: ${m.body.replace(/\s+/g, " ").slice(0, 400)}`);
  const res = await runAiTask("summarize_channel", { channel: channel.name, messages }, { userId: user.id });
  return res.ok ? ok({ summary: res.data, basedOn: recent.length, cached: res.meta?.cached === true }) : res;
}

export async function draftCommunityText({ user, communityId, kind, name, brief }) {
  const { data: me } = await (await createClient()).from("community_members").select("role, status").eq("community_id", communityId).eq("user_id", user.id).maybeSingle();
  if (!me || me.status !== "active" || !roleAtLeast(me.role, "admin")) return fail("You do not have permission to do that.", { code: "forbidden" });
  const res = await runAiTask("draft_community_text", { kind, name, brief }, { userId: user.id });
  return res.ok ? ok({ text: res.data.text }) : res;
}

/** Advisory only. The moderator sees a suggestion beside the report; nothing is changed or stored. */
export async function suggestReportTriage({ user, reportId }) {
  const supabase = await createClient();
  // visibility of the report follows its row level security: a moderator sees only reports about people who rank below them
  const { data: report } = await supabase.from("community_reports").select("id, community_id, channel_id, category, details, snapshot, target_type").eq("id", reportId).maybeSingle();
  if (!report) return fail("You cannot open that report.", { code: "forbidden" });
  if (!(await communityAllowsAi(report.community_id))) return BLOCKED("This community is private, so its text is not sent to the AI provider. Please review it yourself.");
  if (report.channel_id) {
    const { data: channel } = await supabase.from("community_channels").select("type, min_view_role").eq("id", report.channel_id).maybeSingle();
    if (channel && (channel.type === "staff" || channel.min_view_role !== "member")) return BLOCKED("This channel is restricted, so its text is not sent to the AI provider.");
  }
  const content = String(report.snapshot?.body ?? "").trim();
  if (!content) return fail("There is no text to assess.", { code: "no_content" });
  const res = await runAiTask("moderation_assist", { reportCategory: report.category, details: report.details, content }, { userId: user.id });
  return res.ok ? ok({ suggestion: res.data }) : fail(res.error ?? "AI triage is unavailable right now. You can still review the report yourself.", { code: res.code });
}
