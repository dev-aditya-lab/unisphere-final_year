import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { processEmbeddingJobs } from "@/lib/ai/embeddings/jobs";
import { processNotificationEmails } from "@/lib/services/notification-email";
import { processPushNotifications } from "@/lib/services/push";
import { runMaintenanceTasks } from "@/lib/services/maintenance";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorised(request) {
  const secret = getEnv().CRON_SECRET;
  if (!secret) return false;
  const given = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Background work tick: embedding jobs, notification email batches, push notifications, event reminders, orphan cleanup.
 * Called by `npm run worker` (a loop) or any scheduler (cron, Vercel cron, k8s CronJob).
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
