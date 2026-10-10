// Route classification shared by the proxy and navigation code (no server-only imports).

const PROTECTED_ROOTS = new Set([
  "feed", "explore", "search", "ideas", "projects", "communities", "events", "opportunities",
  "connections", "messages", "notifications", "bookmarks", "settings", "admin", "onboarding",
  "alumni", "mentorship", "suspended", "forbidden", "feedback",
]);

// Detail pages that can be public (visibility is decided per record by Row Level Security).
const PUBLIC_DETAIL_ROOTS = new Set(["posts", "projects", "ideas", "events", "communities"]);
const NON_SLUG_SEGMENTS = new Set(["new", "mine", "create", "edit"]);

/** True when an anonymous visitor must be sent to /login. */
export function isProtectedPath(pathname) {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return false;
  const [root, second] = segments;

  if (root === "u") return false; // public profiles; per-profile visibility is enforced by RLS
  if (PUBLIC_DETAIL_ROOTS.has(root) && segments.length === 2 && !NON_SLUG_SEGMENTS.has(second)) {
    return false;
  }
  return PROTECTED_ROOTS.has(root);
}

const AUTH_ONLY_ANON = new Set(["login", "register", "forgot-password"]);

/** Pages signed-in users should not see (they get bounced to the app). */
export function isGuestOnlyPath(pathname) {
  const [root] = pathname.split("/").filter(Boolean);
  return AUTH_ONLY_ANON.has(root);
}
