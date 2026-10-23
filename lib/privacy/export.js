import "server-only";
import { DATA_CATEGORIES, NOTICE_VERSION, PURPOSES } from "@/lib/privacy/registry";
import { listProcessors } from "@/lib/privacy/processors";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * "Give me a copy of my data" (DPDP Act s. 11). Runs on the member's own session, so row level security means it can
 * only contain what they are allowed to see; every query is also limited to rows they own. It never includes other
 * people's profiles, messages or content, and never includes secrets (push keys, tokens).
 *
 * It also carries the information the Act asks for beyond the data itself: what is collected and why, who else handles
 * it, and what has been recorded about the member's consents and requests.
 */

const LIMIT = 5000;

/** What this export deliberately leaves out, and why. Shown to the member so nothing is silently missing. */
export const NOT_INCLUDED = [
  "Other members' profiles, posts, messages and comments (they are other people's information).",
  "Messages you received. Only the messages you sent are included.",
  "Push notification keys and sign-in tokens (secrets that would let someone act as you).",
  "Reports other members made about you, and staff notes: kept for community safety. Decisions taken about your account are included.",
  "Private notes that community moderators wrote about you, and who reported you (shown to moderators only). The decisions they took, with the reasons, are included.",
  "Community channel messages you received. Only the ones you sent are included.",
  "Identity documents for the blue tick: deleted as soon as a decision is made.",
  "Technical request logs held by the hosting provider.",
  "Who invited you, and who you invited (Refer & Earn): those are other members' information. You get the dates and statuses.",
  "The one-way network-address hash kept for 90 days to spot abuse at sign-up: it cannot be turned back into an address.",
];

export async function buildDataExport(supabase, user) {
  const problems = [];
  const mine = (table, column, select = "*", extra = (q) => q) =>
    extra(supabase.from(table).select(select).eq(column, user.id)).limit(LIMIT).then((r) => {
      if (r.error) problems.push(table);
      return r.data ?? [];
    });

  const [
    profile, education, experiences, achievements, posts, comments, projects, projectMemberships, communityMemberships, bookmarks, follows,
    connections, connectionRequests, blocks, postReactions, commentReactions, classInfo, notifPrefs, standing, appeals, deletion, messages, events,
    orbitBalance, orbitStreak, orbitAnswers, orbitLedger, orbitAchievements, files, pushSubs, feedback, mentorship, blueOrders, blueApps,
    consents, consentHistory, requests, nomination, aiUsage, referralCode, referralsSent, referredVia, referralPrompt,
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle().then((r) => r.data),
    mine("profile_education", "user_id"),
    mine("profile_experiences", "user_id"),
    mine("profile_achievements", "user_id"),
    mine("posts", "author_id", "id, slug, title, body, category, visibility, status, created_at, edited_at"),
    mine("comments", "author_id", "id, post_id, parent_id, body, status, created_at"),
    mine("projects", "owner_id", "id, slug, name, tagline, problem, solution, status, created_at"),
    mine("project_members", "user_id"),
    mine("community_members", "user_id"),
    mine("bookmarks", "user_id", "post_id, created_at"),
    mine("follows", "follower_id", "following_id, created_at"),
    supabase.from("connections").select("user_a, user_b, created_at").or(`user_a.eq.${user.id},user_b.eq.${user.id}`).limit(LIMIT).then((r) => {
      if (r.error) problems.push("connections");
      return r.data ?? [];
    }),
    mine("connection_requests", "requester_id", "recipient_id, message, status, created_at, responded_at"),
    mine("user_blocks", "blocker_id", "blocked_id, created_at"),
    mine("post_reactions", "user_id"),
    mine("comment_reactions", "user_id"),
    mine("profile_class_info", "user_id"),
    mine("notification_preferences", "user_id", "category, in_app, email"),
    mine("moderation_actions", "target_user_id", "action, reason, created_at", (q) => q.in("action", ["warn", "remove_content", "restore_content", "restrict", "suspend", "reinstate"])),
    mine("appeals", "user_id", "message, status, review_note, created_at, reviewed_at"),
    mine("account_deletion_requests", "user_id", "status, reason, requested_at, scheduled_for"),
    mine("messages", "sender_id", "conversation_id, body, created_at, status"),
    mine("event_registrations", "user_id", "event_id, status, created_at"),
    mine("orbit_balances", "user_id"),
    mine("orbit_streaks", "user_id"),
    mine("orbit_answers", "user_id"),
    mine("orbit_ledger", "user_id", "kind, amount, day, source_type, reason, created_at"),
    mine("orbit_user_achievements", "user_id"),
    mine("files", "owner_id", "id, purpose, original_name, mime_type, size_bytes, status, created_at", (q) => q.neq("status", "deleted")),
    // Only whether a device is registered, never the keys.
    mine("push_subscriptions", "user_id", "id, user_agent, created_at, last_success_at"),
    mine("feedback_items", "user_id", "kind, title, body, status, created_at"),
    mine("mentorship_requests", "mentee_id", "mentor_id, topic, message, status, created_at"),
    mine("blue_tick_orders", "user_id", "provider, amount_paise, currency, status, created_at, paid_at, refunded_at"),
    mine("blue_tick_applications", "user_id", "status, submitted_at, reviewed_at, rejection_reason"),
    mine("consent_current", "user_id", "purpose, status, notice_version, updated_at"),
    mine("consent_events", "user_id", "purpose, status, notice_version, source, created_at"),
    mine("privacy_requests", "user_id", "reference, kind, status, subject, details, created_at, closed_at, outcome_reason"),
    supabase.from("privacy_nominations").select("nominee_name, nominee_email, relationship, created_at").maybeSingle().then((r) => r.data ?? null),
    // Members cannot read this table directly (staff only), so it is read with the server's key, limited to this member's id.
    createAdminClient().from("ai_usage_logs").select("task, provider, model, status, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(LIMIT).then((r) => {
      if (r.error) problems.push("ai_usage_logs");
      return r.data ?? [];
    }),
    // Refer & Earn tables are server-only (members use functions), so they are read with the server's key, limited to this member's id.
    createAdminClient().from("referral_codes").select("code, created_at").eq("user_id", user.id).maybeSingle().then((r) => r.data ?? null),
    createAdminClient().from("referrals").select("status, registered_at, qualified_at, reward_amount").eq("referrer_id", user.id).order("registered_at", { ascending: false }).limit(LIMIT).then((r) => {
      if (r.error) problems.push("referrals");
      return r.data ?? [];
    }),
    // Only the fact and the dates: who sent the invite is that member's information.
    createAdminClient().from("referrals").select("status, registered_at, qualified_at").eq("referred_id", user.id).maybeSingle().then((r) => r.data ?? null),
    createAdminClient().from("referral_prompt_state").select("shown_count, dismiss_count, last_shown_at, last_dismissed_at, opted_out").eq("user_id", user.id).maybeSingle().then((r) => r.data ?? null),
  ]);

  // Community data. Messages are read with the server's key, limited to this member's id, because a member who left a community can
  // no longer read their own old messages through row level security, and they are still theirs to ask for.
  const db = createAdminClient();
  const own = (table, column, select, order) =>
    db.from(table).select(select).eq(column, user.id).order(order, { ascending: false }).limit(LIMIT).then((r) => {
      if (r.error) problems.push(table);
      return r.data ?? [];
    });
  const [channelMessages, communityDecisions, communityAppeals, communityReports, communityPrefs] = await Promise.all([
    own("channel_messages", "author_id", "community_id, channel_id, body, reply_to_id, status, created_at, edited_at", "created_at"),
    db.from("community_mod_actions").select("community_id, action, reason, expires_at, created_at").eq("target_user_id", user.id).neq("action", "note").order("created_at", { ascending: false }).limit(LIMIT).then((r) => {
      if (r.error) problems.push("community_mod_actions");
      return r.data ?? [];
    }),
    own("community_appeals", "user_id", "community_id, message, status, review_note, created_at, reviewed_at", "created_at"),
    own("community_reports", "reporter_id", "community_id, target_type, category, details, status, created_at", "created_at"),
    own("community_notify_prefs", "user_id", "community_id, channel_id, level, muted_until", "updated_at"),
  ]);

  return {
    exported_at: new Date().toISOString(),
    note: "This file contains data you created or provided, and information about how UniSphere uses it. It does not include other members' content or private information.",
    notice_version: NOTICE_VERSION,
    account: { id: user.id, email: user.email, created_at: user.created_at },
    how_your_data_is_used: {
      data_collected: DATA_CATEGORIES.map((c) => ({ category: c.label, items: c.items, required: c.required, purpose: c.purpose, use: c.use })),
      purposes: PURPOSES.map((p) => ({ purpose: p.key, label: p.label, kind: p.kind, summary: p.summary })),
      service_providers: listProcessors().map((p) => ({ name: p.name, role: p.role, receives: p.receives, why: p.why })),
      read_more: "See the privacy notice at /privacy-notice and the privacy policy at /privacy.",
    },
    profile,
    education, experiences, achievements,
    class_info: classInfo,
    posts, comments, projects, project_memberships: projectMemberships, community_memberships: communityMemberships,
    bookmarks, following: follows, connections, connection_requests_sent: connectionRequests, blocked_members: blocks,
    post_reactions: postReactions, comment_reactions: commentReactions,
    event_registrations: events,
    messages_you_sent: messages,
    communities: {
      channel_messages_you_sent: channelMessages,
      moderator_decisions_about_you: communityDecisions,
      your_appeals: communityAppeals,
      reports_you_filed: communityReports,
      notification_choices: communityPrefs,
    },
    mentorship_requests_sent: mentorship,
    feedback_sent: feedback,
    orbits: { balance: orbitBalance, streak: orbitStreak, answers: orbitAnswers, ledger: orbitLedger, achievements: orbitAchievements },
    refer_and_earn: { your_invite_code: referralCode, invites_you_sent: referralsSent, how_you_joined: referredVia, reminder_choices: referralPrompt },
    files: files,
    notification_preferences: notifPrefs,
    devices_registered_for_push: pushSubs,
    moderation: { decisions_about_you: standing, your_appeals: appeals },
    blue_tick: { applications: blueApps, payments: blueOrders },
    consents: { current: consents, history: consentHistory },
    privacy_requests: requests,
    nomination,
    ai_usage_metadata: aiUsage,
    deletion_requests: deletion,
    not_included: NOT_INCLUDED,
    ...(problems.length ? { incomplete_sections: problems } : {}),
  };
}
