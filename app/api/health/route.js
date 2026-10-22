import { NextResponse } from "next/server";
import { createAnonClient } from "@/lib/supabase/anon";
import { getEnv, getIntegrations } from "@/lib/env";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { timingSafeEqual } from "node:crypto";
import { APP_VERSION } from "@/lib/version";

export const dynamic = "force-dynamic";

/**
 * Liveness and readiness for load balancers and uptime monitors (UptimeRobot).
 *   GET /api/health          → 200 as soon as the process serves requests (no dependencies touched)
 *   GET /api/health?deep=1   → also checks the database; 503 if it is unreachable
 * Anonymous callers get the database answer only. Which providers are configured (the stack behind the app) is shown only
 * with `Authorization: Bearer <CRON_SECRET>`, and the deep check is rate limited per address because it queries the database.
 * Never hostnames, keys or error text.
 */
function isOperator(request) {
  const secret = getEnv().CRON_SECRET;
  const given = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  return Boolean(secret) && given.length === secret.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret));
}

export async function GET(request) {
  const base = { status: "ok", version: APP_VERSION };
  if (new URL(request.url).searchParams.get("deep") !== "1") return NextResponse.json(base, { headers: { "Cache-Control": "no-store" } });

  const limit = await rateLimit({ key: `health-deep:${await getClientIp()}`, limit: 30, windowSec: 60 });
  if (!limit.ok) return NextResponse.json({ status: "rate_limited" }, { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": String(limit.resetSec) } });

  const checks = {};
  try {
    const { error } = await createAnonClient().from("system_settings").select("key").eq("key", "platform_name").limit(1);
    checks.database = error ? "down" : "ok";
  } catch {
    checks.database = "down";
  }
  if (isOperator(request)) {
    const integrations = getIntegrations();
    checks.redis = integrations.redis ? "configured" : "not configured";
    checks.storage = integrations.r2 ? "configured" : "not configured";
    checks.email = integrations.email || integrations.emailViaMailpit ? "configured" : "not configured";
    checks.push = integrations.push ? "configured" : "not configured";
    checks.ai = integrations.groq ? "configured" : "not configured";
  }

  const healthy = checks.database === "ok";
  return NextResponse.json({ ...base, status: healthy ? "ok" : "degraded", checks }, { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
