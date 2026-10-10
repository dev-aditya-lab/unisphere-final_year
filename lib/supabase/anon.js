import "server-only";
import { createClient } from "@supabase/supabase-js";

let client;

/**
 * Supabase client with NO user session: it sees exactly what an anonymous visitor sees (public content only).
 * Use it for anything that is cached or served to crawlers (sitemap, social preview images), so a signed-in member's
 * private content can never leak into a public cache.
 */
export function createAnonClient() {
  if (!client) {
    client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}
