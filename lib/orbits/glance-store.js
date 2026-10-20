"use client";

import { useEffect, useSyncExternalStore } from "react";

/**
 * One in-memory copy of the member's Orbits "glance" (balance, streak, daily bonus, challenge, unseen badges), shared by the
 * header pill, the feed widget, the mobile strip, the More sheet and the celebration queue. Every value in it came from the
 * server: either rendered with the page or returned by an Orbits action. The browser never computes a balance.
 *
 * Each snapshot carries `at`, the database clock in milliseconds. A snapshot only replaces the stored one if it is newer, so a
 * slow response or a stale server render can never move a number backwards.
 */
let current = null;
const listeners = new Set();

export function publishGlance(next) {
  if (!next || typeof next.at !== "number") return;
  if (current && next.at <= current.at) return;
  current = next;
  listeners.forEach((l) => l());
}

/** Local change to the stored snapshot that does not claim to be newer (for example: the unseen badges were taken). */
export function patchGlance(patch) {
  if (!current) return;
  current = { ...current, ...patch };
  listeners.forEach((l) => l());
}

const subscribe = (l) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const snapshot = () => current;
const serverSnapshot = () => null;

/** The newest glance known on this page. `initial` is what the server rendered (null when it could not be read). */
export function useGlance(initial = null) {
  const live = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  useEffect(() => {
    publishGlance(initial);
  }, [initial]);
  if (!live) return initial;
  if (initial && initial.at > live.at) return initial;
  return live;
}

/** Notifies listeners that something outside the Orbits widgets may have changed the member's Orbits (a post, a reaction). */
export const ORBITS_CHANGED = "unisphere:orbits-changed";

/** The current snapshot (used by tests and by code that is not a component). */
export const peekGlance = () => current;
