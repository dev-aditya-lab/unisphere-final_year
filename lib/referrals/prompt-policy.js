// When the Refer & Earn reminder may appear in the browser (pure: easy to test).
//
// The SERVER decides whether a reminder is due at all (frequency, dismissal limit, opt-out, "has used the platform"), and
// counts it. These rules only keep it away from moments when it would interrupt something: composing, messaging, a form,
// another dialog, a hidden tab. A reminder that is held back is not lost and does not start the cooldown.

/** Routes where nothing should pop up: sign-in flows, messaging, privacy and account screens, feedback, and the page itself. */
const BLOCKED_PREFIXES = ["/messages", "/onboarding", "/privacy-review", "/privacy-requests", "/delete-account", "/settings", "/feedback", "/referrals", "/orbits", "/suspended", "/forbidden", "/auth", "/admin"];

export function isPromptRouteAllowed(pathname) {
  const path = String(pathname || "/").split("?")[0];
  if (BLOCKED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) return false;
  // creating or editing anything: /ideas/new, /projects/new, /events/x/edit, ...
  if (/\/(new|edit|compose|create|manage)(\/|$)/.test(path)) return false;
  return true;
}

/**
 * @param {object} state  what the page looks like right now
 *   pathname, visible (document visible), modalOpen (another dialog is open), typing (focus is in a field),
 *   composing (the post composer is open), sessionShown (already handled in this browser session)
 */
export function canShowPromptNow({ pathname, visible = true, modalOpen = false, typing = false, composing = false, sessionShown = false }) {
  if (sessionShown || !visible || modalOpen || typing || composing) return false;
  return isPromptRouteAllowed(pathname);
}

/** Whether the element that has focus is one the person is typing into. */
export function isTypingTarget(el) {
  if (!el || typeof el.tagName !== "string") return false;
  const tag = el.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable === true;
}

/** Starts with "unisphere:" so "clear what UniSphere stores on this device" removes it. */
export const PROMPT_SESSION_KEY = "unisphere:refprompt-session";
/** Seconds the page must have been open before a reminder is even considered. */
export const PROMPT_DELAY_MS = Number(process.env.NEXT_PUBLIC_REFERRAL_PROMPT_DELAY_MS) || 25_000;
/** How often a held-back reminder re-checks the page. */
export const PROMPT_RECHECK_MS = 6_000;
/** After this long without finding a quiet moment, give up for this page load (the server cooldown never started). */
export const PROMPT_GIVE_UP_MS = 5 * 60_000;
