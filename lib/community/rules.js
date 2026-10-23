// Community roles, channel types and the words the interface uses for them (isomorphic: no I/O, no secrets).
//
// The database is the only authority. `community_role_permissions` and the functions in migrations 0054 and 0055 decide
// what a member may do; this file mirrors the same table so the interface can hide buttons and explain what a role means.
// A button that is shown here but refused there simply answers with an error. Hiding a button is never authorisation.

export const ROLES = ["member", "moderator", "admin", "owner"];
export const ROLE_RANK = { member: 1, moderator: 2, admin: 3, owner: 4 };

export const ROLE_LABEL = { owner: "Owner", admin: "Administrator", moderator: "Moderator", member: "Member" };

/** Mirrors community_role_permissions (migration 0054). Each role holds its own permissions and everything below it. */
const OWN = {
  member: ["channels.view", "messages.send", "messages.attach", "messages.edit_own", "messages.delete_own", "reports.create"],
  moderator: ["messages.moderate", "messages.pin", "reports.review", "members.restrict", "members.approve", "channels.view_staff", "invites.manage"],
  admin: ["channels.manage", "branding.manage", "settings.manage", "members.ban", "roles.manage_limited", "audit.view", "appeals.review"],
  owner: ["roles.manage", "community.transfer", "community.delete"],
};

export const PERMISSIONS = Object.fromEntries(
  ROLES.map((role) => [role, new Set(ROLES.filter((r) => ROLE_RANK[r] <= ROLE_RANK[role]).flatMap((r) => OWN[r]))]),
);

export const rankOf = (role) => ROLE_RANK[role] ?? 0;
export const roleAtLeast = (role, min) => rankOf(role) >= rankOf(min);
/** Interface hint only. */
export const roleCan = (role, permission) => Boolean(role && PERMISSIONS[role]?.has(permission));

/** What each role means, in plain words, for the roles screen. */
export const ROLE_SUMMARY = {
  member: "Read and write in channels they can see, attach files, edit or delete their own messages, and report problems.",
  moderator: "Everything a member can do, plus remove or pin messages, time members out, review reports, approve join requests and manage invitations.",
  admin: "Everything a moderator can do, plus manage channels, branding and settings, ban members, appoint moderators, read the audit log and decide appeals.",
  owner: "Everything an administrator can do, plus appoint administrators, hand the community to someone else, and delete it. There is always exactly one owner.",
};

/** Shown before someone is given a role with real power. */
export const ROLE_WARNING = {
  moderator: "Moderators can remove other people's messages, time members out and read reports about members. Only choose someone you trust.",
  admin: "Administrators can ban members, change every channel and setting, appoint moderators and read the audit log. Only the owner can appoint or remove them.",
};

export const CHANNEL_TYPES = [
  { value: "text", label: "Discussion", hint: "Open conversation for everyone in the community.", view: "member", post: "member" },
  { value: "announcements", label: "Announcements", hint: "Only staff post. Members are notified unless they mute it.", view: "member", post: "moderator" },
  { value: "qna", label: "Questions & answers", hint: "Members ask, anyone answers with a reply.", view: "member", post: "member" },
  { value: "resources", label: "Resources", hint: "Links, notes and files worth keeping. Pin the best ones.", view: "member", post: "member" },
  { value: "project", label: "Project collaboration", hint: "A workspace for a team inside the community.", view: "member", post: "member" },
  { value: "staff", label: "Staff only", hint: "Private to moderators and above. Members cannot see that it exists.", view: "moderator", post: "moderator" },
];
export const channelTypeLabel = (type) => CHANNEL_TYPES.find((t) => t.value === type)?.label ?? "Channel";

export const VIEW_ROLES = [
  { value: "member", label: "Every member" },
  { value: "moderator", label: "Moderators and above" },
  { value: "admin", label: "Administrators and above" },
];
export const POST_ROLES = [
  { value: "member", label: "Every member" },
  { value: "moderator", label: "Moderators and above" },
  { value: "admin", label: "Administrators and above" },
  { value: "owner", label: "Only the owner (read-only for everyone else)" },
];

export const SLOW_MODE_OPTIONS = [
  { value: 0, label: "Off" }, { value: 5, label: "5 seconds" }, { value: 15, label: "15 seconds" }, { value: 30, label: "30 seconds" },
  { value: 60, label: "1 minute" }, { value: 300, label: "5 minutes" }, { value: 900, label: "15 minutes" }, { value: 3600, label: "1 hour" },
];

export const NOTIFY_LEVELS = [
  { value: "all", label: "All messages", hint: "Every message in the channel." },
  { value: "mentions", label: "Mentions and replies", hint: "Only when someone mentions or replies to you. The default." },
  { value: "none", label: "Nothing", hint: "Announcements and mentions are silent too." },
];
export const MUTE_OPTIONS = [
  { hours: 1, label: "For 1 hour" }, { hours: 8, label: "For 8 hours" }, { hours: 24, label: "For 24 hours" }, { hours: 24 * 7, label: "For 7 days" },
];

export const REPORT_CATEGORIES = [
  { value: "harassment", label: "Bullying or harassment" },
  { value: "hate", label: "Hate or discrimination" },
  { value: "violence", label: "Threats or violence" },
  { value: "self_harm", label: "Self-harm" },
  { value: "sexual", label: "Sexual or inappropriate content" },
  { value: "scam", label: "Scam or fraud" },
  { value: "impersonation", label: "Impersonation" },
  { value: "spam", label: "Spam" },
  { value: "privacy", label: "Shares private information" },
  { value: "misinformation", label: "Harmful misinformation" },
  { value: "other", label: "Something else" },
];
export const reportCategoryLabel = (v) => REPORT_CATEGORIES.find((c) => c.value === v)?.label ?? v;

export const REPORT_STATUS_LABEL = { open: "Open", reviewing: "Reviewing", action_taken: "Action taken", dismissed: "Dismissed", appealed: "Appealed" };

export const MOD_ACTION_LABEL = {
  warn: "Warning", timeout: "Timed out", clear_timeout: "Timeout ended", remove: "Removed from the community", ban: "Banned", unban: "Ban lifted",
  remove_message: "Message removed", note: "Private note", appeal_reversal: "Appeal upheld",
};
/** Actions a member can appeal (mirrors submit_community_appeal). */
export const APPEALABLE = new Set(["timeout", "remove", "ban", "remove_message"]);

export const TIMEOUT_OPTIONS = [
  { hours: 1, label: "1 hour" }, { hours: 6, label: "6 hours" }, { hours: 24, label: "1 day" }, { hours: 72, label: "3 days" }, { hours: 168, label: "7 days" }, { hours: 672, label: "28 days" },
];

export const INVITE_EXPIRY_OPTIONS = [
  { hours: 1, label: "1 hour" }, { hours: 24, label: "1 day" }, { hours: 168, label: "7 days" }, { hours: 720, label: "30 days" },
];
export const INVITE_USE_OPTIONS = [
  { value: 1, label: "One person" }, { value: 5, label: "5 people" }, { value: 25, label: "25 people" }, { value: 100, label: "100 people" }, { value: 0, label: "No limit" },
];

/** Branding: design recommendations, not platform rules. The server only requires the proportions and a sensible minimum. */
export const BRANDING = {
  icon: { label: "Community icon", ratio: 1, width: 512, height: 512, minWidth: 128, hint: "Square, recommended 512 × 512 pixels. Shown small, so keep it simple." },
  banner: { label: "Community banner", ratio: 3, width: 1500, height: 500, minWidth: 600, hint: "Wide 3:1, recommended 1500 × 500 pixels. Keep important detail away from the edges." },
};

export const MAX_MESSAGE_CHARS = 4000;
export const MAX_ATTACHMENTS = 5;

/** The reasons the composer is locked (channel_post_state), in words. 'ok' and 'not_found' have no text. */
export const POST_STATE_TEXT = {
  read_only: "Only people with a higher role can post in this channel.",
  archived: "This channel is archived. It is read-only.",
  timed_out: "A moderator has timed you out. You can read, but not post, until it ends.",
  rules_required: "Accept the community rules to start posting.",
  account_restricted: "Your account is restricted, so you cannot post right now.",
};

export const COMMUNITY_TOPICS = [
  "study-groups", "coding", "design", "hackathons", "placements", "research", "startups", "sports", "music", "art", "gaming", "careers", "clubs", "events", "mental-health", "open-source",
];

/** A channel name as typed, ready to send: trimmed, collapsed whitespace, no control characters. */
export const cleanName = (value) => String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
