"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** Whether this browser can open the device share sheet (false on the server and during hydration, so markup always matches). */
export function useCanShare({ files = false } = {}) {
  return useSyncExternalStore(
    subscribe,
    () => typeof navigator !== "undefined" && typeof navigator.share === "function" && (!files || typeof navigator.canShare === "function"),
    () => false,
  );
}
