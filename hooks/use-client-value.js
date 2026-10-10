"use client";

import { useSyncExternalStore } from "react";

const subscribeNone = () => () => {};

/**
 * Reads a browser-only value (user agent, display mode, localStorage…) without an effect. `read` must return a
 * primitive (string, number, boolean); `serverValue` is what the server render and hydration see, so there is
 * never a mismatch.
 */
export function useClientValue(read, serverValue) {
  return useSyncExternalStore(subscribeNone, read, () => serverValue);
}
