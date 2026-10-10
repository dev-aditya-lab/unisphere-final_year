// Background worker: calls the app's /api/cron/tick on an interval.
//   npm run worker                       (uses .env.local)
//   WORKER_INTERVAL_SEC=30 npm run worker
// The tick runs embedding jobs, notification email batches, push notifications, event reminders and orphan-file cleanup.
// It is deliberately a thin loop: all logic lives in the app (one codebase, one set of env vars), so
// the same endpoint can instead be driven by a platform scheduler (cron / Vercel cron / k8s CronJob).
// In a container the environment is provided directly; dotenv is only needed on a developer machine.
try {
  const { config } = await import("dotenv");
  config({ path: ".env.development.local", quiet: true });
  config({ path: ".env.local", quiet: true });
  config({ quiet: true });
} catch {
  /* dotenv not installed: rely on the process environment */
}

const base = (process.env.WORKER_TARGET_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
const secret = process.env.CRON_SECRET;
const intervalMs = Math.max(10, Number(process.env.WORKER_INTERVAL_SEC) || 30) * 1000;

if (!secret) {
  console.error("CRON_SECRET is not set; refusing to start (the tick endpoint requires it).");
  process.exit(1);
}

let stopping = false;
process.on("SIGINT", () => (stopping = true));
process.on("SIGTERM", () => (stopping = true));

console.log(`[worker] ticking ${base}/api/cron/tick every ${intervalMs / 1000}s`);
while (!stopping) {
  const started = Date.now();
  try {
    const res = await fetch(`${base}/api/cron/tick`, { method: "POST", headers: { Authorization: `Bearer ${secret}` } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) console.error(`[worker] tick failed: HTTP ${res.status}`, body);
    else {
      const e = body.embeddings ?? {};
      const n = body.notificationEmails ?? {};
      console.log(`[worker] ok in ${body.ms}ms · embeddings claimed=${e.claimed ?? 0} · emails sent=${n.sent ?? 0} failed=${n.failed ?? 0} · push sent=${body.push?.pushed ?? 0}`);
    }
  } catch (err) {
    console.error("[worker] tick error:", err.message);
  }
  const wait = Math.max(1000, intervalMs - (Date.now() - started));
  for (let waited = 0; waited < wait && !stopping; waited += 500) await new Promise((r) => setTimeout(r, 500));
}
console.log("[worker] stopped");
