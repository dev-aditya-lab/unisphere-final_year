import { NextResponse } from "next/server";
import { createAnonClient } from "@/lib/supabase/anon";
import { getIntegrations } from "@/lib/env";
import { APP_VERSION } from "@/lib/version";

export const dynamic = "force-dynamic";

/**
 * Liveness and readiness for load balancers and uptime monitors (UptimeRobot).
 *   GET /api/health          → 200 as soon as the process serves requests (no dependencies touched)
 *   GET /api/health?deep=1   → also checks the database; 503 if it is unreachable
 * Only coarse yes/no answers are returned: never hostnames, keys or error text.
 */
export async function GET(request) {
  const base = { status: "ok", version: APP_VERSION };
  if (new URL(request.url).searchParams.get("deep") !== "1") return NextResponse.json(base, { headers: { "Cache-Control": "no-store" } });

  const checks = {};
  try {
    const { error } = await createAnonClient().from("system_settings").select("key").eq("key", "platform_name").limit(1);
    checks.database = error ? "down" : "ok";
  } catch {
    checks.database = "down";
  }
  const integrations = getIntegrations();
  checks.redis = integrations.redis ? "configured" : "not configured";
  checks.storage = integrations.r2 ? "configured" : "not configured";
  checks.email = integrations.email || integrations.emailViaMailpit ? "configured" : "not configured";
  checks.push = integrations.push ? "configured" : "not configured";
  checks.ai = integrations.groq ? "configured" : "not configured";

  const healthy = checks.database === "ok";
  return NextResponse.json({ ...base, status: healthy ? "ok" : "degraded", checks }, { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
