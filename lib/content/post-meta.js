// Category and visibility metadata shared by the composer, cards and filters (isomorphic).

export const POST_CATEGORIES = [
  { value: "general", label: "General", icon: "MessageSquare", variant: "mono", titleRequired: false, hint: "Share an update or thought." },
  { value: "projects", label: "Project", icon: "FolderKanban", variant: "soft", titleRequired: true, hint: "Show what you are building." },
  { value: "ideas", label: "Idea", icon: "Lightbulb", variant: "warning", titleRequired: true, hint: "Describe an idea and find related work." },
  { value: "questions", label: "Question", icon: "HelpCircle", variant: "soft", titleRequired: false, hint: "Ask the community." },
  { value: "opportunities", label: "Opportunity", icon: "Briefcase", variant: "success", titleRequired: true, hint: "Internships, research, competitions." },
  { value: "achievements", label: "Achievement", icon: "Trophy", variant: "success", titleRequired: false, hint: "Celebrate a win." },
  { value: "events", label: "Event", icon: "CalendarDays", variant: "soft", titleRequired: false, hint: "Talks, workshops, meetups." },
  { value: "experiences", label: "Experience", icon: "GraduationCap", variant: "warning", titleRequired: true, hint: "Lessons from your journey." },
];

export const CATEGORY_BY_VALUE = Object.fromEntries(POST_CATEGORIES.map((c) => [c.value, c]));

export const POST_VISIBILITY = [
  { value: "public", label: "Public", hint: "Anyone, including people not logged in." },
  { value: "college", label: "My college", hint: "Members of your college." },
  { value: "connections", label: "Connections", hint: "Only people you are connected with." },
  { value: "private", label: "Only me", hint: "A private note, visible only to you." },
];

export const COMMUNITY_POST_VISIBILITY = [
  { value: "community", label: "Community members", hint: "Only active members of this community." },
  { value: "public", label: "Public", hint: "Anyone (public communities only)." },
];

export const REACTIONS = [
  { value: "like", label: "Like", emoji: null },
  { value: "insightful", label: "Insightful" },
  { value: "celebrate", label: "Celebrate" },
  { value: "curious", label: "Curious" },
];

export const REPORT_CATEGORIES = [
  { value: "spam", label: "Spam or scam" },
  { value: "harassment", label: "Harassment or bullying" },
  { value: "hate", label: "Hate speech or discrimination" },
  { value: "sexual", label: "Sexual content" },
  { value: "violence", label: "Violence or threats" },
  { value: "self_harm", label: "Self-harm" },
  { value: "misinformation", label: "Misinformation" },
  { value: "impersonation", label: "Impersonation" },
  { value: "plagiarism", label: "Copied work" },
  { value: "privacy", label: "Shares private information" },
  { value: "other", label: "Something else" },
];

export const FEED_SCOPES = [
  { value: "college", label: "My college" },
  { value: "following", label: "Following" },
  { value: "public", label: "Public" },
];
