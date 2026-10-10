"use client";

import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env-public";

let client;

/** Browser client (publishable key only). Used for Realtime subscriptions. */
export function getBrowserClient() {
  if (!client) {
    client = createBrowserClient(publicEnv.supabaseUrl, publicEnv.supabasePublishableKey);
  }
  return client;
}
