// A tiny in-page channel so a new post can appear in the feed the instant it is saved, without the page being
// re-rendered by the server first. The composer emits; any mounted feed list that wants the post takes it.

const listeners = new Set();

/** Returns true when a mounted list took the post (so the caller need not refresh the page to show it). */
export function emitPostCreated(post) {
  let taken = false;
  for (const listener of listeners) if (listener(post) === true) taken = true;
  return taken;
}

export function onPostCreated(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// A change to one post that a list may hold a copy of (a reaction or bookmark that was saved), so the copy, and the
// on-device cache built from it, stay current without reloading the feed.
const changeListeners = new Set();

export function emitPostChanged(postId, patch) {
  for (const listener of changeListeners) listener(postId, patch);
}

export function onPostChanged(listener) {
  changeListeners.add(listener);
  return () => changeListeners.delete(listener);
}
