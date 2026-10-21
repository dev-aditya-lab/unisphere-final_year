// "Write a post" buttons live in the app frame, the composer lives on the feed. A button asks for the editor with this
// event; a composer on the current page answers by opening itself (and cancelling the event). When nobody answers, the
// button falls back to going to /feed#compose, and the request is remembered for a few seconds so the composer opens as
// soon as it appears (a tap can arrive before the page has finished loading). The hash alone is not enough: Next.js
// changes it with history.pushState, which never fires `hashchange`, so on the feed the page only scrolled.
export const COMPOSE_EVENT = "unisphere:compose";

const REMEMBER_MS = 5000;
let askedAt = 0;

/**
 * True when a composer on this page opened the editor. Otherwise the request is kept for the next composer that mounts.
 * `starter` ({ category, title, body }) pre-fills an editor that is still empty; it never replaces what someone has typed.
 */
export function requestCompose(starter = null) {
  const event = new CustomEvent(COMPOSE_EVENT, { cancelable: true, detail: starter });
  window.dispatchEvent(event);
  if (event.defaultPrevented) return true;
  askedAt = Date.now();
  return false;
}

/** Called by a composer as it mounts: was the editor asked for just before it appeared? Each request is used once. */
export function takePendingCompose() {
  const wanted = askedAt > 0 && Date.now() - askedAt < REMEMBER_MS;
  askedAt = 0;
  return wanted;
}
