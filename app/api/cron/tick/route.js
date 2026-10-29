import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { processEmbeddingJobs } from "@/lib/ai/embeddings/jobs";
import { processNotificationEmails } from "@/lib/services/notification-email";
import { processPushNotifications } from "@/lib/services/push";
import { runMaintenanceTasks } from "@/lib/services/maintenance";
import { processGoogleSync } from "@/lib/services/academy-google";
import { draftNextDailyQuestion, publishDueDailyQuestion } from "@/lib/services/orbit-question-automation";
import { deliverReferralCampaign, runReferralMaintenance } from "@/lib/services/referrals";

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
 * Background work tick: embedding jobs, notification email batches, push notifications, Academy live-class Google sync, event reminders, Refer & Earn upkeep and its one-time announcement, orphan cleanup, and the Daily Challenge automation (draft at 16:00 IST, publish at 02:00 IST).
 * Called by `npm run worker` (a loop) or any scheduler: UptimeRobot, Vercel cron, a server cron job.
 * Nothing here runs unless something calls it, and it is refused without CRON_SECRET.
 */
async function run(request) {
  if (!authorised(request)) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const started = Date.now();
  const result = {};
  for (const [name, fn] of [
    ["embeddings", () => processEmbeddingJobs({ limit: 20, requeueStale: true })],
    ["notificationEmails", () => processNotificationEmails({ limit: 100 })],
    ["push", () => processPushNotifications({ limit: 100 })],
    // Live classes: create/refresh Google Calendar events with a Meet link and invite the enrolled students (does nothing until Google is connected).
    ["academyGoogle", () => processGoogleSync({ limit: 10 })],
    ["maintenance", () => runMaintenanceTasks()],
    // Refer & Earn: expire referrals that ran out of time, then (only if an administrator switched it on) send the in-app announcement.
    ["referrals", () => runReferralMaintenance()],
    ["referralCampaign", () => deliverReferralCampaign({ limit: 500 })],
    // Publishing comes before drafting: drafting waits for the AI (up to a minute) and must never delay the 02:00 publish.
    ["orbitQuestionPublish", () => publishDueDailyQuestion()],
    ["orbitQuestionDraft", () => draftNextDailyQuestion()],
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
