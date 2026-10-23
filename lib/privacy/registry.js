// The single source of truth for what UniSphere asks consent for, what it collects and why.
//
// Everything the privacy notice, the signup form, the consent settings and the policy say about data comes from this
// file, and `tests/unit/privacy-registry.test.js` fails if this content changes without a new notice version, so a
// purpose can never be added or reworded silently. To change anything here:
//   1. edit the content,
//   2. add a new entry to NOTICE_VERSIONS (a new version string, a summary, and the purposes that need fresh consent),
//   3. update that entry's `fingerprint` (the test prints the new value).
// Existing consents then stay exactly as they were; people are told what changed and asked again only where listed.
//
// Client-safe: no server-only imports, so forms can use it.

export const MIN_AGE = 18;

/** The purposes. `key` matches the consent_purposes table (migration 0043). */
export const PURPOSES = [
  {
    key: "core_service",
    kind: "essential",
    label: "Run my UniSphere account",
    summary: "Use the information I give UniSphere to run my account, show my profile and content as I choose, and deliver the features I use.",
    requiredFor: "creating and using an account",
    withdrawal:
      "Withdrawing this means UniSphere can no longer run your account, so it is done by deleting your account. After a 14-day grace period your data is erased, except the records listed in the privacy notice.",
  },
  {
    key: "age_confirmation",
    kind: "essential",
    label: "I am 18 or older",
    summary: "A declaration that I am an adult. UniSphere does not collect a date of birth or an identity document for this.",
    requiredFor: "creating and using an account",
    withdrawal: "This is a statement of fact, not a permission, so it cannot be withdrawn. If it is no longer true, tell the privacy team.",
  },
  {
    key: "ai_assist",
    kind: "optional",
    label: "Use AI features on the text I submit",
    summary:
      "When I use an AI feature (writing help, idea discovery, summaries), send the text I submit for that request to the AI provider UniSphere uses, to get a result.",
    requiredFor: "the AI features only. Everything else works without it",
    withdrawal: "AI features stop working for you. Nothing else changes. Text already sent is not recalled; see the processors list for what each provider keeps.",
  },
  {
    key: "ai_discovery_index",
    kind: "optional",
    label: "Let AI index my public posts and profile for discovery",
    summary:
      "Convert my public or college-visible posts, projects and profile summary into numeric embeddings with an AI provider, so related ideas and people can be found.",
    requiredFor: "being found by semantic search and idea discovery. Keyword search works without it",
    withdrawal: "The embeddings derived from your content are deleted and no new ones are made. Your posts and profile are not changed.",
  },
  {
    key: "identity_verification",
    kind: "optional",
    label: "Review my identity document for the blue tick",
    summary: "Let UniSphere reviewers open the identity document I upload, only to compare my name and photo with my profile for the blue tick.",
    requiredFor: "the blue tick only",
    withdrawal: "Reviewers stop using the document and it is deleted. A tick that was already granted is not removed by this.",
  },
];

export const PURPOSE_BY_KEY = Object.fromEntries(PURPOSES.map((p) => [p.key, p]));
export const OPTIONAL_PURPOSES = PURPOSES.filter((p) => p.kind === "optional");
export const ESSENTIAL_PURPOSES = PURPOSES.filter((p) => p.kind === "essential");

/**
 * What is collected, itemised. `purpose` points at the PURPOSES entry that covers it ("service" rows are part of
 * running the account). `required` means UniSphere cannot create the account without it.
 */
export const DATA_CATEGORIES = [
  {
    id: "account",
    label: "Account details",
    items: ["Full name", "Username", "Email address", "Password (kept only as a one-way hash by the sign-in service)"],
    required: true,
    purpose: "core_service",
    use: "Create and secure your account, sign you in, send the confirmation and security emails.",
  },
  {
    id: "declaration",
    label: "Adult declaration",
    items: ["A yes/no statement that you are 18 or older, with the date you made it"],
    required: true,
    purpose: "age_confirmation",
    use: "Apply UniSphere's age policy. No date of birth or document is collected.",
  },
  {
    id: "profile",
    label: "Profile details you choose to add",
    items: [
      "Headline, bio, profile photo and cover image",
      "Colleges or schools, your role at each, department, programme and campus",
      "Skills, interests, links, availability and the roles you would collaborate in",
      "Year and semester (hidden from others unless you turn on show my class)",
    ],
    required: false,
    purpose: "core_service",
    use: "Show your profile to the people you allow, suggest people and posts, and help others find collaborators.",
  },
  {
    id: "content",
    label: "What you post and do",
    items: [
      "Posts, comments, reactions, bookmarks, follows and connections",
      "Projects, communities, events and opportunities you create or join",
      "Reports you file and feedback you send",
      "Daily Challenge answers, Orbits balance, streaks, badges and leaderboard position",
    ],
    required: false,
    purpose: "core_service",
    use: "Provide the features you use, in the audience you choose for each post.",
  },
  {
    id: "referrals",
    label: "Invites and referrals (Refer & Earn)",
    items: [
      "Your invite code, and for each person who joins through it: that they joined, whether and when they became an active member, and the Orbits you earned (you are never shown their name)",
      "For a person who joined through an invite link: the code on the link, kept on their device for up to 30 days, and a short-lived keyed hash of their network address at sign-up, used only to notice abuse and deleted within 90 days",
      "Your own choices about Refer & Earn reminders, and whether you have seen the launch announcement",
    ],
    required: false,
    purpose: "core_service",
    use: "Pay the Orbits reward once, rank the referral leaderboard, stop abuse of the reward, and keep reminders to the amount you chose.",
  },
  {
    id: "messages",
    label: "Messages and attachments",
    items: ["Direct messages you send and receive", "Images and PDFs you attach to messages and to community channels"],
    required: false,
    purpose: "core_service",
    use: "Deliver messages to the people you write to. Only the people in a conversation can read it.",
  },
  {
    id: "communities",
    label: "Communities and channels",
    items: [
      "Messages you post in community channels, with the files you attach, replies, mentions, edits and pins",
      "Your role in a community, whether you are timed out or banned, and the point up to which you have read each channel",
      "Your notification and mute choices for communities and channels",
      "Invitation links you create or use (only a one-way hash of the code is kept) and requests to join",
    ],
    required: false,
    purpose: "core_service",
    use: "Let a community talk in channels, keep the right people in and out, and tell you about mentions, replies and announcements you did not mute.",
  },
  {
    id: "technical",
    label: "Security and technical data",
    items: [
      "IP address, browser and device details of your sign-ins and requests",
      "Rate-limit counters and security logs",
      "A push notification address, only if you switch on notifications in your browser",
    ],
    required: true,
    purpose: "core_service",
    use: "Keep your account and the service safe, stop abuse, and deliver notifications you asked for.",
  },
  {
    id: "notifications",
    label: "Notifications",
    items: ["In-app notification records", "Email notifications, only for the categories you enable"],
    required: false,
    purpose: "core_service",
    use: "Tell you about activity that involves you. You choose the categories in Settings.",
  },
  {
    id: "support",
    label: "Messages to UniSphere",
    items: ["Name, email address and message you send through the contact or grievance form"],
    required: false,
    purpose: "core_service",
    use: "Answer you and keep a record of how your request was handled.",
  },
  {
    id: "moderation",
    label: "Safety and moderation records",
    items: [
      "Reports made about your content or account, including a copy of the reported message and the two before it, kept for a limited period",
      "Decisions, warnings, timeouts, bans and appeals, and private notes written by community moderators (not shown to you)",
    ],
    required: false,
    purpose: "core_service",
    use: "Keep the community safe and let you appeal decisions.",
  },
  {
    id: "ai_text",
    label: "Text you submit to AI features",
    items: [
      "The draft or question you send to an AI feature, trimmed and with obvious contact details masked",
      "When you ask for a summary of a public community channel: its recent messages without names. When a moderator asks for a second opinion: the reported message, for public communities only",
    ],
    required: false,
    purpose: "ai_assist",
    use: "Get the suggestion you asked for. Only sent after you have allowed AI features.",
  },
  {
    id: "ai_index",
    label: "AI index of your public content",
    items: ["Numeric embeddings made from your public or college-visible posts, projects and profile summary"],
    required: false,
    purpose: "ai_discovery_index",
    use: "Let related ideas and people be found. Only made after you have allowed it.",
  },
  {
    id: "identity",
    label: "Identity document and payment record (blue tick only)",
    items: [
      "A masked identity document you upload (never stored after the decision)",
      "Order and payment reference, amount, date and status from the payment provider (never your card, UPI or bank details)",
    ],
    required: false,
    purpose: "identity_verification",
    use: "Confirm who you are for the blue tick, and keep the accounting record of the payment.",
  },
];

/**
 * Versions of the notice. Add to the END. `fingerprint` pins the content above and the notice text in
 * lib/privacy/notice.js; `reconsentPurposes` lists purposes people must confirm again because of this version
 * (everything else keeps its existing consent and people are only informed).
 */
export const NOTICE_VERSIONS = [
  {
    version: "2026-10-21.1",
    effectiveAt: "2026-10-21T00:00:00+05:30",
    summary:
      "First notice written for India's Digital Personal Data Protection Act, 2023 and Rules, 2025: itemised data, separate purposes, optional AI choices, rights requests, grievances and breach handling.",
    reconsentPurposes: ["core_service", "age_confirmation"],
    fingerprint: "8ea3cb388b8473469415fc43a9b5f0fc45139e6f165815fda841a72d9b232458",
  },
  {
    version: "2026-10-22.1",
    effectiveAt: "2026-10-22T00:00:00+05:30",
    summary:
      "Refer & Earn: UniSphere now records invite codes and referrals, keeps a short-lived keyed hash of the network address at sign-up to spot abuse, and remembers your reminder choices. No new consent is needed; this is part of running your account.",
    reconsentPurposes: [],
    fingerprint: "17fbc6b28aaf3f84d563ac04f4d9df29e0458e57c42fcaa7dff9799794faffd2",
  },
  {
    version: "2026-10-23.1",
    effectiveAt: "2026-10-23T00:00:00+05:30",
    summary:
      "Communities with channels: UniSphere now stores the messages you post in community channels, your role and any moderation decision in a community, the point you have read up to, your notification choices and the invitation links you use. Reports keep a copy of the reported message for a limited period. You can ask for a summary of a public channel (names removed) with AI, only when you choose to. No new consent is needed; this is part of running your account.",
    reconsentPurposes: [],
    fingerprint: "6c3bdfc83c821d19184f6075bb4567f14d43ff0fa77664a999d76b89f437ca8f",
  },
];

export const CURRENT_NOTICE = NOTICE_VERSIONS[NOTICE_VERSIONS.length - 1];
export const NOTICE_VERSION = CURRENT_NOTICE.version;

export const REQUEST_KINDS = {
  access: { label: "Get a copy of my data", plural: "Data copies" },
  correction: { label: "Correct my data", plural: "Corrections" },
  erasure: { label: "Delete my account and data", plural: "Deletions" },
  nomination: { label: "Nominate someone", plural: "Nominations" },
  grievance: { label: "Grievance", plural: "Grievances" },
  other: { label: "Other privacy request", plural: "Other" },
};

export const REQUEST_STATUS = {
  received: { label: "Received", tone: "warning", hint: "We have your request and will start on it." },
  verifying: { label: "Checking it is you", tone: "warning", hint: "We are confirming the request is yours." },
  in_progress: { label: "In progress", tone: "soft", hint: "Someone is working on it." },
  awaiting_requester: { label: "Waiting for you", tone: "warning", hint: "We asked you a question. Reply below to continue." },
  completed: { label: "Done", tone: "success", hint: "The request was carried out." },
  partially_completed: { label: "Done, with exceptions", tone: "success", hint: "Carried out, except for what is explained below." },
  rejected: { label: "Not carried out", tone: "danger", hint: "We could not carry this out; the reason is below." },
  cancelled: { label: "Cancelled", tone: "mono", hint: "Withdrawn by you." },
};

export const OPEN_STATUSES = ["received", "verifying", "in_progress", "awaiting_requester"];
export const CLOSED_STATUSES = ["completed", "partially_completed", "rejected", "cancelled"];

/** Fields a member cannot change themselves, so a correction request is the route. */
export const CORRECTABLE_FIELDS = [
  { value: "email", label: "My sign-in email address" },
  { value: "username", label: "My username (it is locked for 14 days after a change)" },
  { value: "verified_name", label: "The name on my blue tick" },
  { value: "orbits", label: "My Orbits, streak or badge record" },
  { value: "moderation_record", label: "A moderation record about me" },
  { value: "other", label: "Something else" },
];

export const INCIDENT_SEVERITY = ["low", "medium", "high", "critical"];
export const INCIDENT_STATUS = {
  suspected: "Suspected",
  investigating: "Investigating",
  contained: "Contained",
  confirmed: "Confirmed",
  notified: "Notified",
  resolved: "Resolved",
  closed: "Closed",
  not_a_breach: "Not a breach",
};
export const INCIDENT_DATA_CATEGORIES = DATA_CATEGORIES.map((c) => ({ value: c.id, label: c.label }));

/** True when the moment has passed. A helper (not inline) so server components stay pure to render. */
export const isPast = (iso) => Date.parse(iso) < Date.now();
