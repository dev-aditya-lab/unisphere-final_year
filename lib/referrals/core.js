// Refer & Earn: the pieces both the server and the browser need (pure: no I/O, easy to test).
//
// The link only NAMES a referral code. Nothing in this file (or in the browser) decides who is eligible or whether a
// reward is paid; the database does, see supabase/migrations/20260143000051_referrals.sql.

export const REFERRAL_REWARD = 100;

/**
 * `username-xxxx`: the member's username (easy to remember) and a 4-character random suffix from a 31-symbol alphabet without
 * 0/1/i/l/o (what makes it unguessable). Lower case is canonical. The same pattern is a CHECK constraint on referral_codes.
 */
export const REF_CODE_REGEX = /^[a-z0-9_-]{3,30}-[abcdefghjkmnpqrstuvwxyz23456789]{4}$/;

export const REF_PARAM = "ref";
/** First-party cookie that remembers an invite link between the click and the sign-up. Holds "CODE.EPOCHSECONDS". */
export const REF_COOKIE = "us_ref";
/** The longest an administrator can set `attribution_days` to; the cookie lives this long and the server enforces the real setting. */
export const REF_COOKIE_MAX_DAYS = 90;
export const SIGNUP_PATH = "/register";

/** A well-formed code in canonical (lower case) form, or null. Never throws, whatever the input. */
export function normalizeRefCode(value) {
  if (typeof value !== "string" || value.length > 64) return null;
  const code = value.trim().toLowerCase();
  return REF_CODE_REGEX.test(code) ? code : null;
}

export function makeRefCookieValue(code, nowMs = Date.now()) {
  const c = normalizeRefCode(code);
  return c ? `${c}.${Math.floor(nowMs / 1000)}` : null;
}

/**
 * The code stored in a cookie value, if it is well formed and still inside the attribution window.
 * A value from the future or an unparsable timestamp is refused.
 */
export function parseRefCookieValue(value, { nowMs = Date.now(), maxDays = 30 } = {}) {
  if (typeof value !== "string") return null;
  const [rawCode, rawTs, ...rest] = value.split(".");
  if (rest.length || !rawTs || !/^\d{9,11}$/.test(rawTs)) return null;
  const code = normalizeRefCode(rawCode);
  if (!code) return null;
  const ageMs = nowMs - Number(rawTs) * 1000;
  if (ageMs < -60_000 || ageMs > Math.max(1, maxDays) * 86_400_000) return null;
  return code;
}

/** The invite link for a code. `appUrl` is the site origin (NEXT_PUBLIC_APP_URL); the sign-up route is /register. */
export function buildReferralUrl(code, appUrl) {
  const c = normalizeRefCode(code);
  if (!c) return null;
  return `${String(appUrl).replace(/\/$/, "")}${SIGNUP_PATH}?${REF_PARAM}=${c}`;
}

export function buildShareText(url) {
  return `Join me on UniSphere — connect with students, discover opportunities and build your community. Join here: ${url}`;
}

/**
 * Share targets that need nothing but a link (no SDK, no third-party script). Each is a plain https/mailto/sms URL the
 * visitor opens by tapping it, so it works in a browser, the installed PWA and the Android TWA alike.
 */
export function shareTargets(url) {
  if (!url) return [];
  const text = buildShareText(url);
  const lead = text.slice(0, text.length - url.length).trim();
  const enc = encodeURIComponent;
  return [
    { id: "whatsapp", label: "WhatsApp", href: `https://wa.me/?text=${enc(text)}` },
    { id: "telegram", label: "Telegram", href: `https://t.me/share/url?url=${enc(url)}&text=${enc(lead)}` },
    { id: "x", label: "X", href: `https://twitter.com/intent/tweet?text=${enc(text)}` },
    { id: "linkedin", label: "LinkedIn", href: `https://www.linkedin.com/sharing/share-offsite/?url=${enc(url)}` },
    { id: "email", label: "Email", href: `mailto:?subject=${enc("Join me on UniSphere")}&body=${enc(text)}` },
    { id: "sms", label: "Message", href: `sms:?&body=${enc(text)}` },
  ];
}

/** How a referral appears to its referrer. Names are never shown: only a status and a date. */
export const REFERRAL_STATUS_LABEL = {
  registered: { label: "Joined", detail: "Waiting for them to finish setting up and become active." },
  pending_qualification: { label: "Almost there", detail: "Waiting for them to become active." },
  rewarded: { label: "Reward credited", detail: "You earned 100 Orbits." },
  expired: { label: "Expired", detail: "They did not become active in time." },
  reversed: { label: "Reversed", detail: "This reward was taken back after a review." },
};

/** The qualification rule, in words, built from the live settings so the page never promises more than the database enforces. */
export function qualificationRules({ activation_days = 2, qualify_days = 30 } = {}) {
  const days = Math.max(1, Number(activation_days) || 1);
  return [
    "Your friend signs up with your link and confirms their email address.",
    "They finish setting up their profile.",
    `They then use UniSphere on ${days === 1 ? "a day" : `${days} different days`} (for example the Daily Orbit Bonus, the Daily Challenge or a post).`,
    `All of this must happen within ${Number(qualify_days) || 30} days of them signing up.`,
  ];
}
