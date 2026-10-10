import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getEnv } from "@/lib/env";

let admin;

/**
 * Service-role client: BYPASSES Row Level Security.
 * Only use after an explicit server-side authorization check, never with
 * client-supplied ids that have not been verified, and never import into
 * client components (the `server-only` import enforces this at build time).
 */
export function createAdminClient() {
  if (!admin) {
    const env = getEnv();
    admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return admin;
}
