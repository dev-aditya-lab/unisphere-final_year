// Route classification shared by the proxy and navigation code (no server-only imports).
//
// UniSphere is a closed network for Ramgarh Engineering College. Only the pages below are visible to a logged-out
// visitor: the marketing/legal pages that explain what it is, and the sign-in flow. Everything else (feed, posts,
// profiles, projects, events, roadmap, changelog, ...) needs a signed-in member. Unknown paths default to
// "protected", so a new feature can never become public by accident.

const PUBLIC_ROOTS = new Set([
  "about", "features", "guidelines", "privacy", "terms", "contact",
  "login", "register", "forgot-password", "reset-password", "verify-email",
  "auth", "maintenance", "forbidden", "offline", ".well-known",
]);

/** True when an anonymous visitor must be sent to /login. The home page ("/") is public. */
export function isProtectedPath(pathname) {
  const [root] = pathname.split("/").filter(Boolean);
  if (!root) return false;
  return !PUBLIC_ROOTS.has(root);
}

const AUTH_ONLY_ANON = new Set(["login", "register", "forgot-password"]);

/** Pages signed-in users should not see (they get bounced to the app). */
export function isGuestOnlyPath(pathname) {
  const [root] = pathname.split("/").filter(Boolean);
  return AUTH_ONLY_ANON.has(root);
}
