"use client";

import { useClientValue } from "@/hooks/use-client-value";
import { isNativeApp } from "@/lib/native/client";

/** True inside the Android app. The server render and hydration always see false, so there is never a mismatch. */
export const useIsNativeApp = () => useClientValue(isNativeApp, false);
