// Unsent text is kept on this device so a refresh, a crash or a dropped connection does not lose it.
//
// Scope: only what the member typed into a post composer. Nothing is sent anywhere, it is keyed by account, it
// expires after a week, and it is removed on log out (see clearUserCaches in components/pwa/pwa-provider.jsx).
// Every storage call is guarded: private windows and blocked storage simply mean no draft.

const PREFIX = "unisphere:draft:";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function readDraft(key) {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const { at, value } = JSON.parse(raw);
    if (!at || Date.now() - at > MAX_AGE_MS) {
      window.localStorage.removeItem(PREFIX + key);
      return null;
    }
    return value ?? null;
  } catch {
    return null;
  }
}

export function writeDraft(key, value) {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify({ at: Date.now(), value }));
  } catch {
    /* storage full or unavailable: no draft */
  }
}

export function clearDraft(key) {
  try {
    window.localStorage.removeItem(PREFIX + key);
  } catch {
    /* nothing to clear */
  }
}

/** Removes every draft on this device (log out, account switch). */
export function clearAllDrafts() {
  try {
    const keys = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(PREFIX)) keys.push(k);
    }
    keys.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    /* nothing to clear */
  }
}
