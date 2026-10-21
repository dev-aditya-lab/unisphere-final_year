// Turns a stored notification into display text + destination (isomorphic, no I/O).

export const NOTIFICATION_CATEGORIES = [
  { value: "social", label: "Reactions, comments & mentions", hint: "When people react to, comment on, mention or repost your posts, or follow you." },
  { value: "connections", label: "Connections", hint: "Connection requests and acceptances." },
  { value: "projects", label: "Projects", hint: "Join requests, invitations and decisions." },
  { value: "mentorship", label: "Mentorship", hint: "Mentoring requests and replies." },
  { value: "messages", label: "Messages", hint: "New direct messages (one notification per conversation until you read it)." },
  { value: "events", label: "Events", hint: "Reminders for events you are going to." },
  { value: "moderation", label: "Moderation & account", hint: "Decisions about reports, warnings and appeals. Always recommended." },
  { value: "announcements", label: "Official announcements", hint: "Announcements from your college." },
];

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
    case "moderation_verification": // sent before college verification was removed; old notifications still read sensibly
      return { text: "An old college verification update", href: "/notifications" };
    default:
      return { text: "You have a new notification", href: "/notifications" };
  }
}
