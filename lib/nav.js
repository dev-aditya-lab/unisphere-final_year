/**
 * Primary navigation (plain data: icons are referenced by name and resolved in client components).
 * `ready: false` hides an entry until its feature ships, so the UI
 * never links to a page that does not exist. `flag` ties an entry to a runtime feature flag.
 */
export const NAV_ITEMS = [
  { href: "/feed", label: "Feed", icon: "Home", ready: true, group: "main" },
  { href: "/explore", label: "Explore", icon: "Compass", ready: true, group: "main" },
  { href: "/orbits", label: "Orbits", icon: "Orbit", ready: true, group: "main" },
  { href: "/referrals", label: "Refer & Earn", icon: "Gift", ready: true, group: "main" },
  { href: "/ideas", label: "Ideas", icon: "Lightbulb", ready: true, group: "main" },
  { href: "/projects", label: "Projects", icon: "FolderKanban", ready: true, group: "main" },
  { href: "/communities", label: "Communities", icon: "Users", ready: true, group: "campus", flag: "communities" },
  { href: "/events", label: "Events", icon: "CalendarDays", ready: true, group: "campus", flag: "events" },
  { href: "/opportunities", label: "Opportunities", icon: "Briefcase", ready: true, group: "campus", flag: "opportunities" },
  { href: "/colleges", label: "Colleges", icon: "Landmark", ready: true, group: "campus" },
  { href: "/alumni", label: "Alumni", icon: "GraduationCap", ready: true, group: "campus", flag: "alumni_network" },
  { href: "/connections", label: "Connections", icon: "Link2", ready: true, group: "you" },
  { href: "/messages", label: "Messages", icon: "MessageCircle", ready: true, group: "you", flag: "messaging" },
  { href: "/notifications", label: "Notifications", icon: "Bell", ready: true, group: "you" },
  { href: "/bookmarks", label: "Bookmarks", icon: "Bookmark", ready: true, group: "you" },
  { href: "/feedback", label: "Feedback", icon: "MessageSquareHeart", ready: true, group: "you" },
  { href: "/settings", label: "Settings", icon: "Settings", ready: true, group: "you" },
];

/**
 * Destinations whose route tree has no `loading.js` (a skeleton boundary) because a descendant calls `notFound()` and a
 * streamed page cannot return a 404 status. Next.js can only prefetch such a dynamic page by rendering it in full on
 * the server, which is database work for a page the member may never open, repeated on every page view. They are left
 * to load on click instead (the link shows a pending state, see `NavPending`).
 *
 * Projects, communities, events, opportunities and colleges used to be here. Their list pages now sit in a `(list)`
 * route group with their own `loading.js`, which covers only the list page and not the detail routes beside it, so
 * they prefetch cheaply (layout down to the skeleton) and open instantly. Messages used to be here too: its layout
 * now answers at once with a skeleton and does its checks inside Suspense, so it prefetches and opens like the rest.
 * Nothing is listed at the moment; a route that needs to stay out of prefetching goes in this set.
 */
const NO_PREFETCH = new Set();
export const shouldPrefetch = (href) => !NO_PREFETCH.has(href);

export const NAV_GROUPS = [
  { id: "main", label: "Discover" },
  { id: "campus", label: "Campus" },
  { id: "you", label: "You" },
];

/** Items that are built and enabled (flags is a { key: boolean } map). */
export function visibleNav(flags = {}) {
  return NAV_ITEMS.filter((i) => i.ready && (!i.flag || flags[i.flag] === true));
}

// Feed and Explore, the post button, then Messages and More (every other section lives in the More sheet; notifications
// also have the top bar bell).
export const MOBILE_BOTTOM_HREFS = ["/feed", "/explore", "/messages"];
