// Turns a stored notification into display text + destination (isomorphic, no I/O).

export const NOTIFICATION_CATEGORIES = [
  { value: "social", label: "Reactions, comments & mentions", hint: "When people react to, comment on, mention or repost your posts, or follow you." },
  { value: "connections", label: "Connections", hint: "Connection requests and acceptances." },
  { value: "projects", label: "Projects", hint: "Join requests, invitations and decisions." },
  { value: "mentorship", label: "Mentorship", hint: "Mentoring requests and replies." },
  { value: "messages", label: "Messages", hint: "New direct messages. Your phone is told about every message at once; the bell keeps one entry per conversation until you read it. Mute one conversation from its own menu." },
  { value: "events", label: "Events", hint: "Reminders for events you are going to." },
  { value: "moderation", label: "Moderation & account", hint: "Decisions about reports, warnings and appeals. Always recommended." },
  { value: "communities", label: "Communities", hint: "Mentions and replies in community channels, announcements, invitations and join decisions. Mute a whole community or one channel from its own menu." },
  { value: "announcements", label: "Official announcements", hint: "Official announcements from UniSphere and from your college." },
  { value: "rewards", label: "Orbits & referral rewards", hint: "When a friend you invited becomes active and you earn Orbits, or a reward is reviewed." },
  { value: "academy", label: "Academy", hint: "UniSphere Academy: enrolment and payment receipts, refund updates, live class and deadline reminders, mentor feedback, course completion, certificates and course announcements." },
  { value: "promotions", label: "Offers & invitations", hint: "Occasional UniSphere announcements, such as a new feature to try. Shown only in the app, never sent by email or push." },
];

/**
 * The category of a notification type: the same rules as public.notification_category() in the database, which is what actually decides
 * (notify() stores it). This copy lets code and tests ask without a database; an integration test keeps the two identical
 * (tests/integration/notification-controls.test.js).
 */
export function notificationCategory(type) {
  const t = String(type ?? "");
  if (["reaction", "comment", "reply", "mention", "repost", "follow"].includes(t)) return "social";
  if (["connection_request", "connection_accepted"].includes(t)) return "connections";
  if (t.startsWith("project_")) return "projects";
  if (t.startsWith("mentorship_")) return "mentorship";
  if (t === "message") return "messages";
  if (t.startsWith("event_")) return "events";
  if (t.startsWith("moderation_")) return "moderation";
  if (t === "announcement") return "announcements";
  if (t.startsWith("referral_reward") || t === "referral_reversed") return "rewards";
  if (t === "referral_campaign") return "promotions";
  if (t.startsWith("community_") || t.startsWith("channel_")) return "communities";
  if (t.startsWith("academy_")) return "academy";
  return "social";
}

/** Categories whose email switch would do nothing, so the settings screen does not show it. */
export const IN_APP_ONLY_CATEGORIES = new Set(["promotions"]);

/**
 * Academy pages. A course id is only ever put into a path after it is checked to be a uuid (it comes from our own database, but a path
 * is built from it, so it is checked anyway); anything else opens the Academy dashboard.
 */
const UUID_PATH = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const learnHref = (courseId, hash = "") => (UUID_PATH.test(String(courseId ?? "")) ? `/academy/learn/${courseId}${hash}` : "/academy/my-learning");
const rupees = (minor) => {
  const n = Number(minor);
  return Number.isFinite(n) ? new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: n % 100 === 0 ? 0 : 2, maximumFractionDigits: n % 100 === 0 ? 0 : 2 }).format(n / 100) : "";
};
const inHours = (h) => (Number(h) <= 1 ? "in about an hour" : `in about ${Number(h) || 24} hours`);

/** A channel link. The community address and channel id come from our own database, but only a plain slug and a uuid are ever put in a path. */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function channelHref(d, channelId) {
  if (!SLUG.test(String(d.community ?? "")) || !UUID.test(String(channelId ?? ""))) return "/communities";
  const message = UUID.test(String(d.message ?? "")) ? `?m=${d.message}` : "";
  return `/communities/${d.community}/channels/${channelId}${message}`;
}

const postHref = (d) => `${d.category === "ideas" ? "/ideas/" : "/posts/"}${d.slug}`;

export function describeNotification(n, actorName) {
  const who = actorName || "Someone";
  const d = n.data ?? {};
  switch (n.type) {
    case "reaction":
      return { text: `${who} reacted to your post “${d.title ?? ""}”`, href: postHref(d) };
    case "comment":
      return { text: `${who} commented on “${d.title ?? ""}”`, detail: d.snippet, href: `${postHref(d)}#comments` };
    case "reply":
      return { text: `${who} replied to your comment`, detail: d.snippet, href: `${postHref(d)}#comments` };
    case "mention":
      return { text: `${who} mentioned you in “${d.title ?? ""}”`, href: postHref(d) };
    case "repost":
      return { text: `${who} reposted “${d.title ?? ""}”`, href: postHref(d) };
    case "follow":
      return { text: `${who} started following you`, href: n.actor_id ? `/connections` : "/connections" };
    case "connection_request":
      return { text: `${who} wants to connect`, detail: d.message, href: "/connections?tab=requests" };
    case "connection_accepted":
      return { text: `${who} accepted your connection request`, href: "/connections" };
    case "project_join_request":
      return { text: `${who} asked to join ${d.name ?? "your project"}`, detail: d.message, href: `/projects/${d.slug}/manage` };
    case "project_join_decision":
      return { text: d.accepted ? `You were added to ${d.name}` : `Your request to join ${d.name} was declined`, href: `/projects/${d.slug}` };
    case "project_invitation":
      return { text: `${who} invited you to join ${d.name}${d.role ? ` as ${d.role}` : ""}`, detail: d.message, href: `/projects/${d.slug}` };
    case "project_invitation_response":
      return { text: `${who} ${d.accepted ? "accepted" : "declined"} your invitation to ${d.name}`, href: `/projects/${d.slug}/manage` };
    case "mentorship_request":
      return { text: `${who} asked you for mentoring${d.topic ? ` about ${d.topic}` : ""}`, detail: d.message, href: "/alumni?tab=requests" };
    case "mentorship_response":
      return { text: `${who} ${d.accepted ? "accepted" : "declined"} your mentoring request`, detail: d.message, href: "/alumni?tab=requests" };
    case "message":
      return { text: `${who} sent you a message`, detail: d.snippet, href: `/messages/${n.entity_id}` };
    case "event_reminder":
      return { text: `${d.title} starts ${d.when}`, href: `/events/${d.slug}` };
    case "event_update":
      return { text: `${d.title} was updated`, detail: d.change, href: `/events/${d.slug}` };
    case "announcement":
      return { text: `Announcement: ${d.title}`, detail: d.snippet, href: d.href ?? "/feed" };
    // Community channels. The text never contains what was written (lock screens and push services are not private); the message is
    // opened only after the member is signed in and the server confirms they may read the channel.
    case "channel_mention":
      return { text: `${who} mentioned you in ${d.community_name ?? "a community"}`, detail: d.channel ? `#${d.channel}` : undefined, href: channelHref(d, n.entity_id) };
    case "channel_reply":
      return { text: `${who} replied to your message in ${d.community_name ?? "a community"}`, detail: d.channel ? `#${d.channel}` : undefined, href: channelHref(d, n.entity_id) };
    case "channel_announcement":
      return { text: `New announcement in ${d.community_name ?? "a community"}`, detail: d.channel ? `#${d.channel}` : undefined, href: channelHref(d, n.entity_id) };
    case "community_invite":
      return { text: `${who} invited you to join ${d.name ?? "a community"}`, href: d.code ? `/join/${d.code}` : d.slug ? `/communities/${d.slug}` : "/communities" };
    case "community_join_request":
      return { text: `${who} asked to join ${d.name ?? "your community"}`, href: d.slug ? `/communities/${d.slug}/settings?tab=members` : "/communities" };
    case "community_join_decision":
      return { text: d.accepted ? `You were added to ${d.name ?? "the community"}` : `Your request to join ${d.name ?? "the community"} was declined`, href: d.slug ? (d.accepted ? `/communities/${d.slug}/channels` : `/communities/${d.slug}`) : "/communities" };
    case "community_role":
      return { text: d.role === "owner" ? `You are now the owner of ${d.name ?? "a community"}` : `Your role in ${d.name ?? "a community"} changed to ${d.role ?? "member"}`, href: d.slug ? `/communities/${d.slug}` : "/communities" };
    case "moderation_community_action": {
      const what = { warn: "You received a warning", timeout: "You were timed out", clear_timeout: "Your timeout ended", remove: "You were removed", ban: "You were banned", unban: "Your ban was lifted", remove_message: "A moderator removed your message" }[d.action] ?? "A moderator took action";
      return { text: `${what} in ${d.name ?? "a community"}`, detail: d.reason, href: d.slug ? `/communities/${d.slug}` : "/communities" };
    }
    case "moderation_community_report":
      return { text: `New report to review in ${d.name ?? "your community"}`, href: d.slug ? `/communities/${d.slug}/settings?tab=moderation` : "/communities" };
    case "moderation_community_appeal":
      return { text: `${who} appealed a decision in ${d.name ?? "your community"}`, href: d.slug ? `/communities/${d.slug}/settings?tab=moderation` : "/communities" };
    case "moderation_community_appeal_decision":
      return { text: `Your appeal in ${d.name ?? "the community"} was ${d.upheld ? "upheld" : "decided"}`, detail: d.note, href: d.slug ? `/communities/${d.slug}` : "/communities" };
    case "referral_reward":
      return { text: "A friend you invited is now an active member. You earned 100 Orbits.", href: "/referrals" };
    case "referral_reversed":
      return { text: "A referral reward was reversed after a review.", detail: "Open Refer & Earn to see your referrals.", href: "/referrals" };
    case "referral_campaign":
      return { text: d.title || "Invite friends. Earn 100 Orbits.", detail: d.snippet, href: "/referrals" };
    case "feedback_update": {
      const verb = { triaged: "was reviewed", planned: "is now on the roadmap", in_progress: "is being built", shipped: "has shipped", declined: "was declined", duplicate: "was merged with a similar request" }[d.status] ?? "was updated";
      return { text: `Your ${d.kind === "bug" ? "bug report" : d.kind === "feature" ? "idea" : "feedback"} “${d.title ?? ""}” ${verb}`, detail: d.response, href: "/feedback?tab=mine" };
    }
    case "moderation_content_removed":
      return { text: d.title ? `A moderator removed your ${d.kind ?? "content"} “${d.title}”` : `A moderator removed your ${d.kind ?? "content"}`, detail: d.reason, href: "/settings/security" };
    case "moderation_warning":
      return { text: "You received a warning", detail: d.reason, href: "/settings/security" };
    case "moderation_restriction":
      return { text: d.level === "suspended" ? "Your account was suspended" : "Your account was restricted", detail: d.reason, href: "/settings/security" };
    case "moderation_appeal_decision":
      return { text: `Your appeal was ${d.upheld ? "upheld" : "decided"}`, detail: d.note, href: "/settings/security" };
    case "moderation_privacy_request":
      return { text: `There is an update on your privacy request ${d.reference ?? ""}`.trim(), href: "/privacy-requests" };
    case "moderation_privacy_incident":
      return { text: d.subject ?? "An important notice about your personal data", detail: d.snippet, href: "/privacy-requests" };
    case "moderation_reinstated":
      return { text: "Your account access was restored", detail: d.note, href: "/feed" };
    case "moderation_report_outcome":
      return { text: d.actioned ? "A moderator acted on a report you filed" : "A moderator reviewed a report you filed and took no action", detail: "Thank you for helping keep UniSphere safe.", href: "/guidelines" };
    case "moderation_blue_tick": {
      // The reason is shown inside the app only; the lock screen gets the sentence alone (lib/services/push.js).
      const text = {
        paid: "We received your blue tick payment. Upload your ID to finish.",
        approved: "Your blue tick is approved",
        rejected: "Your blue tick ID needs another look",
        refunded: "Your blue tick payment was refunded",
        granted: "You were given a blue tick",
        revoked: "Your blue tick was removed",
      }[d.event] ?? "There is an update on your blue tick";
      return { text, detail: d.event === "rejected" || d.event === "revoked" ? d.reason : undefined, href: "/settings/blue-tick" };
    }
    // UniSphere Academy. Lock-screen text names the course or the certificate and nothing a mentor or student wrote.
    case "academy_enrolled":
      return { text: `You are enrolled in ${d.title ?? "a course"}`, detail: d.source === "paid" ? "Your payment was received." : undefined, href: learnHref(d.course_id) };
    case "academy_payment": {
      const text = {
        received: `We received your payment${d.amount_minor ? ` of ${rupees(d.amount_minor)}` : ""}${d.title ? ` for ${d.title}` : ""}`,
        failed: `Your payment${d.title ? ` for ${d.title}` : ""} did not go through`,
      }[d.event] ?? "There is an update on your Academy payment";
      return { text, detail: d.order_no ? `Order ${d.order_no}` : undefined, href: "/academy/payments" };
    }
    case "academy_refund": {
      const text = {
        completed: `Your refund${d.amount_minor ? ` of ${rupees(d.amount_minor)}` : ""} was sent${d.title ? ` for ${d.title}` : ""}`,
        rejected: "Your refund request was reviewed",
      }[d.status] ?? "There is an update on your Academy refund";
      return { text, detail: d.order_no ? `Order ${d.order_no}` : undefined, href: "/academy/payments" };
    }
    case "academy_live_reminder":
      return { text: `${d.title ?? "A live class"} starts ${inHours(d.hours)}`, href: learnHref(d.course_id, "#live") };
    case "academy_assignment_due":
      return { text: `${d.title ?? "An assignment"} is due soon`, href: "/academy/assignments" };
    case "academy_feedback":
      return { text: d.returned ? `A mentor sent back your work on ${d.assignment ?? "an assignment"}` : d.passed ? `Your work on ${d.assignment ?? "an assignment"} was reviewed: passed` : `Your work on ${d.assignment ?? "an assignment"} was reviewed`, href: "/academy/assignments" };
    case "academy_completed":
      return { text: `You completed ${d.title ?? "a course"}`, detail: d.manual_approval ? "Your certificate will be issued after it is approved." : "Your certificate will be issued shortly.", href: "/academy/certificates" };
    case "academy_certificate": {
      const text = {
        issued: `Your certificate for ${d.title ?? "your course"} is ready`,
        reissued: `A corrected certificate for ${d.title ?? "your course"} was issued`,
        revoked: `Your certificate for ${d.title ?? "a course"} was revoked`,
      }[d.event] ?? "There is an update on your certificate";
      return { text, detail: d.certificate_id, href: "/academy/certificates" };
    }
    case "academy_announcement":
      return { text: `Academy announcement: ${d.title ?? "an update from your course"}`, href: learnHref(d.course_id) };
    case "moderation_verification": // sent before college verification was removed; old notifications still read sensibly
      return { text: "An old college verification update", href: "/notifications" };
    default:
      return { text: "You have a new notification", href: "/notifications" };
  }
}
