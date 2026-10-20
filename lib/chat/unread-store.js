"use client";

import { useSyncExternalStore } from "react";

// The live unread total from the messaging engine, for the navigation badge. `null` means "no live value": the badge
// then shows the number the server rendered. Kept apart from the engine so the shell does not pull Dexie in.
let value = null;
const listeners = new Set();

export function setLiveUnread(next) {
  if (next === value) return;
  value = next;
  listeners.forEach((l) => l());
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The count to show on the Messages item: live while the messages area is open, the server's number otherwise. */
export function useLiveMessageCount(serverCount) {
  const live = useSyncExternalStore(subscribe, () => value, () => null);
  return live ?? serverCount;
}
