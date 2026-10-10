/**
 * One set of session-cookie options, shared by the browser client, the server client and the proxy.
 * They MUST agree: a cookie written with different attributes than the one it replaces becomes a second cookie,
 * and the first (stale) one can win, which looks like "I was logged out for no reason".
 *
 *  - Persistent (a long maxAge), so closing the browser or relaunching the installed app keeps the member signed in.
 *    The session itself is still bounded by Supabase (refresh-token rotation, revocation, the "sessions" settings).
 *  - Not HttpOnly: the browser client reads the session for Realtime subscriptions. The access token is short-lived
 *    (one hour), the refresh token rotates on use, and the CSP forbids third-party scripts.
 *  - SameSite=Lax: sent on top-level navigations (links from chat apps, the PWA launching), never on cross-site POSTs.
 *  - Secure whenever the site is served over HTTPS.
 */
const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

export const authCookieOptions = {
  path: "/",
  sameSite: "lax",
  maxAge: 400 * 24 * 60 * 60, // the longest lifetime browsers allow
  secure: appUrl.startsWith("https://"),
};
