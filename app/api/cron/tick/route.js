import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { processEmbeddingJobs } from "@/lib/ai/embeddings/jobs";
import { processNotificationEmails } from "@/lib/services/notification-email";
import { processPushNotifications } from "@/lib/services/push";
import { runMaintenanceTasks } from "@/lib/services/maintenance";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function matches(given, secret) {
  const a = Buffer.from(String(given ?? ""));
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Two ways to present CRON_SECRET, both compared in constant time:
 *   - `Authorization: Bearer <secret>`: Vercel cron, curl, a server cron job (preferred);
 *   - `?secret=<secret>` in the URL: for hosted uptime monitors such as UptimeRobot's free plan, which cannot send
 *     custom headers. A URL can end up in logs, so use a long random value and rotate it if it is ever exposed.
 */
function authorised(request) {
  const secret = getEnv().CRON_SECRET;
  if (!secret) return false;
  const header = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (header && matches(header, secret)) return true;
  const query = new URL(request.url).searchParams.get("secret");
  return Boolean(query) && matches(query, secret);
}

/**
 * Background work tick: embedding jobs, notification email batches, push notifications, event reminders, orphan cleanup.
 * Called by `npm run worker` (a loop) or any scheduler: UptimeRobot, Vercel cron, a server cron job.
 * Nothing here runs unless something calls it, and it is refused without CRON_SECRET.
 */
async function run(request) {
  if (!authorised(request)) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const started = Date.now();
  const result = {};
  for (const [name, fn] of [
    ["embeddings", () => processEmbeddingJobs({ limit: 20 })],
    ["notificationEmails", () => processNotificationEmails({ limit: 100 })],
    ["push", () => processPushNotifications({ limit: 100 })],
    ["maintenance", () => runMaintenanceTasks()],
  ]) {
    try {
      result[name] = await fn();
    } catch (err) {
      console.error(`[tick] ${name} failed:`, err?.message);
      result[name] = { error: String(err?.message ?? err).slice(0, 200) };
    }
  }
  return NextResponse.json({ ok: true, ms: Date.now() - started, ...result });
}

export const GET = run;
export const POST = run;
