// Labels and options shared by the feedback forms, the idea board, the roadmap and the admin triage screen.

export const FEEDBACK_KINDS = [
  { value: "bug", label: "Report a bug", short: "Bug", hint: "Something is broken or behaves wrongly." },
  { value: "feature", label: "Suggest a feature", short: "Idea", hint: "Something UniSphere should do. Others can vote on it." },
  { value: "feedback", label: "Send feedback", short: "Feedback", hint: "Praise, complaints or anything else. Only the team sees it." },
];

export const FEEDBACK_AREAS = [
  { value: "feed", label: "Feed & posts" },
  { value: "profile", label: "Profile & settings" },
  { value: "projects", label: "Projects & ideas" },
  { value: "messages", label: "Messages" },
  { value: "events", label: "Events" },
  { value: "communities", label: "Communities" },
  { value: "search", label: "Search & explore" },
  { value: "notifications", label: "Notifications" },
  { value: "verification", label: "Verification" },
  { value: "admin", label: "Admin console" },
  { value: "other", label: "Something else" },
];

export const BUG_SEVERITIES = [
  { value: "low", label: "Minor: cosmetic or rare" },
  { value: "medium", label: "Annoying: there is a workaround" },
  { value: "high", label: "Serious: I cannot do something important" },
  { value: "critical", label: "Critical: data loss, privacy or security" },
];

export const FEEDBACK_STATUS = {
  new: { label: "New", tone: "mono" },
  triaged: { label: "Reviewed", tone: "soft" },
  planned: { label: "Planned", tone: "warning" },
  in_progress: { label: "In progress", tone: "default" },
  shipped: { label: "Shipped", tone: "success" },
  declined: { label: "Not planned", tone: "mono" },
  duplicate: { label: "Merged", tone: "mono" },
};

export const RELEASE_KINDS = [
  { value: "new", label: "New" },
  { value: "improved", label: "Improved" },
  { value: "fixed", label: "Fixed" },
  { value: "security", label: "Security" },
];

export const areaLabel = (v) => FEEDBACK_AREAS.find((a) => a.value === v)?.label ?? v;
