/**
 * Primary navigation (plain data: icons are referenced by name and resolved in client components).
 * `ready: false` hides an entry until its feature ships, so the UI
 * never links to a page that does not exist. `flag` ties an entry to a runtime feature flag.
 */
export const NAV_ITEMS = [
  { href: "/feed", label: "Feed", icon: "Home", ready: true, group: "main" },
  { href: "/explore", label: "Explore", icon: "Compass", ready: true, group: "main" },
  { href: "/ideas", label: "Ideas", icon: "Lightbulb", ready: true, group: "main" },
  { href: "/projects", label: "Projects", icon: "FolderKanban", ready: true, group: "main" },
  { href: "/communities", label: "Communities", icon: "Users", ready: true, group: "campus", flag: "communities" },
  { href: "/events", label: "Events", icon: "CalendarDays", ready: true, group: "campus", flag: "events" },
  { href: "/opportunities", label: "Opportunities", icon: "Briefcase", ready: true, group: "campus", flag: "opportunities" },
  { href: "/alumni", label: "Alumni", icon: "GraduationCap", ready: true, group: "campus", flag: "alumni_network" },
  { href: "/connections", label: "Connections", icon: "Link2", ready: true, group: "you" },
  { href: "/messages", label: "Messages", icon: "MessageCircle", ready: true, group: "you", flag: "messaging" },
  { href: "/notifications", label: "Notifications", icon: "Bell", ready: true, group: "you" },
  { href: "/bookmarks", label: "Bookmarks", icon: "Bookmark", ready: true, group: "you" },
  { href: "/feedback", label: "Feedback", icon: "MessageSquareHeart", ready: true, group: "you" },
  { href: "/settings", label: "Settings", icon: "Settings", ready: true, group: "you" },
];

export const NAV_GROUPS = [
  { id: "main", label: "Discover" },
  { id: "campus", label: "Campus" },
  { id: "you", label: "You" },
];

/** Items that are built and enabled (flags is a { key: boolean } map). */
export function visibleNav(flags = {}) {
  return NAV_ITEMS.filter((i) => i.ready && (!i.flag || flags[i.flag] === true));
}

// Two tabs, the raised "post" button, then two more (notifications live in the top bar bell).
export const MOBILE_BOTTOM_HREFS = ["/feed", "/explore", "/projects", "/messages"];
