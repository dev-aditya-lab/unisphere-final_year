/**
 * When the Android app offers to turn notifications on (components/native/push-prompt.jsx). Pure, so the rules are tested directly.
 *
 * The pop-up must be helpful, not a nag. It is shown right after a member first opens the app signed in, then again after 3, 7 and
 * 14 days if they still have not turned notifications on, and never more than four times in all. "Don't ask again" ends it at once,
 * and so does switching notifications off by hand in Settings (that is a decision, not an oversight).
 *
 * Two kinds: "ask" (Android has not been refused yet, so the pop-up leads to the system permission box) and "settings" (Android now
 * blocks UniSphere for good and will not show that box again, so the only way is the phone's own settings).
 */
const DAY = 86_400_000;

/** Days to wait after the previous pop-up before showing the 1st (no wait), 2nd, 3rd and 4th. */
export const NUDGE_GAPS_DAYS = [0, 3, 7, 14];
export const MAX_NUDGES = NUDGE_GAPS_DAYS.length;

/** What was remembered on this phone, read defensively: anything that is not the expected shape counts as "never shown". */
export function parseNudgeHistory(raw) {
  try {
    const value = typeof raw === "string" ? JSON.parse(raw) : raw;
    const count = Number.isInteger(value?.count) && value.count >= 0 ? Math.min(value.count, 99) : 0;
    const lastAt = Number.isFinite(value?.lastAt) && value.lastAt > 0 ? value.lastAt : 0;
    return { count, lastAt, never: value?.never === true };
  } catch {
    return { count: 0, lastAt: 0, never: false };
  }
}

/**
 * "ask", "settings", or null (show nothing now).
 * `state` is { supported, permission: "granted" | "denied" | "prompt", enabled } from getNativePushState.
 */
export function decideNudge({ state, history, now = Date.now() }) {
  if (!state?.supported || state.enabled) return null;
  const { count, lastAt, never } = parseNudgeHistory(history);
  if (never || count >= MAX_NUDGES) return null;
  if (count > 0 && now - lastAt < NUDGE_GAPS_DAYS[count] * DAY) return null;
  return state.permission === "denied" ? "settings" : "ask";
}

/** The history after a pop-up was shown (and, with `never`, after the member asked not to be reminded again). */
export function afterNudge(history, now = Date.now(), { never = false } = {}) {
  const before = parseNudgeHistory(history);
  return { count: Math.min(before.count + 1, 99), lastAt: now, never: before.never || never };
}

/** The history after the member switched notifications off themselves: they decided, so there is nothing left to ask. */
export const silencedNudges = (history, now = Date.now()) => ({ ...parseNudgeHistory(history), lastAt: now, never: true });
