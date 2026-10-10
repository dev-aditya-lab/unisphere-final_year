"use client";

import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env-public";
import { authCookieOptions } from "@/lib/supabase/cookie-options";

let client;

/**
 * Browser client (publishable key only). Used for Realtime subscriptions. The session lives in the shared cookie
 * (never localStorage), written with the same options as the server so the two never fork it.
 */
export function getBrowserClient() {
  if (!client) {
    client = createBrowserClient(publicEnv.supabaseUrl, publicEnv.supabasePublishableKey, { cookieOptions: authCookieOptions });
  }
  return client;
}
