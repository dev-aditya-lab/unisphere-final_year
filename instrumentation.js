/**
 * Runs once when a server instance starts (Next.js calls `register`). It starts the loop that sends pending push notifications within
 * seconds (lib/push-loop.js); the Edge runtime has no timers worth keeping, so only Node does.
 * A failure here must never stop the site from starting: the background job (/api/cron/tick) still sends everything, only later.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const [{ startPushLoop }, { processPushNotifications }, { getEnv }] = await Promise.all([
      import("@/lib/push-loop"),
      import("@/lib/services/push"),
      import("@/lib/env"),
    ]);
    const env = getEnv();
    startPushLoop({ run: () => processPushNotifications({ limit: 100 }), seconds: env.PUSH_LOOP_SECONDS, nodeEnv: env.NODE_ENV });
  } catch (err) {
    console.error("[push-loop] could not start:", err?.message);
  }
}
