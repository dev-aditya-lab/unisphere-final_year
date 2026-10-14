export const APP_NAME = "UniSphere";
export const APP_TAGLINE = "Your campus. Your people. Your next idea.";
export const APP_DESCRIPTION =
  "UniSphere is a free, open campus network. It connects students, seniors, alumni, teachers and campus clubs. Share projects, find teammates, discover related ideas with AI, and learn from people who have been where you are going.";

/** Where signed-in users land by default. */
export const HOME_PATH = "/feed";

export const ACCOUNT_TYPES = [
  { value: "student", label: "Student" },
  { value: "alumni", label: "Alumni" },
  { value: "faculty", label: "Faculty" },
  { value: "staff", label: "Staff" },
];

export const PROFILE_VISIBILITY = [
  { value: "public", label: "All members", hint: "Every signed-in UniSphere member can see your profile. People who are not signed in cannot." },
  { value: "college", label: "My college", hint: "Only people at your college (and your connections)." },
  { value: "connections", label: "Connections only", hint: "Only people you are connected with." },
  { value: "private", label: "Only me", hint: "Your profile is hidden from everyone else." },
];

export const MESSAGE_PERMISSIONS = [
  { value: "everyone", label: "Anyone on UniSphere" },
  { value: "college", label: "People at my college" },
  { value: "connections", label: "Connections only" },
  { value: "nobody", label: "Nobody" },
];

export const AVAILABILITY = [
  { value: "few_hours", label: "A few hours a week" },
  { value: "part_time", label: "Part-time" },
  { value: "weekends", label: "Weekends" },
  { value: "full_time", label: "Full-time" },
];

export const COLLABORATION_ROLES = [
  "Frontend", "Backend", "Full-stack", "Mobile", "ML / AI", "Data", "UI / UX design",
  "Product", "Embedded / IoT", "DevOps", "Research", "Writing", "Marketing",
];

/** Routes that must never be claimed as a username / top-level slug. Mirrors the DB table. */
export const RESERVED_USERNAMES = new Set([
  "admin", "administrator", "root", "system", "support", "help", "staff", "moderator", "mod",
  "unisphere", "official", "security", "abuse", "postmaster", "webmaster", "noreply", "no-reply",
  "api", "app", "auth", "login", "logout", "register", "signup", "signin", "settings", "feed",
  "explore", "search", "ideas", "projects", "posts", "events", "clubs", "communities", "opportunities",
  "connections", "messages", "notifications", "bookmarks", "about", "features", "guidelines",
  "privacy", "terms", "contact", "verify-email", "forgot-password", "reset-password", "onboarding",
  "alumni", "mentors", "mentorship", "me", "null", "undefined", "new", "edit", "delete", "static",
  "assets", "public", "sitemap", "robots", "llms", "favicon", "www", "mail", "ftp", "status", "blog",
]);

export const USERNAME_REGEX = /^[a-z0-9][a-z0-9_-]{1,28}[a-z0-9]$/;
