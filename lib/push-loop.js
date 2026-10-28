/**
 * The server sends pending push notifications by itself every few seconds. Without this they would wait for the next call of
 * /api/cron/tick (an uptime monitor, about every 5 minutes), which is far too slow for a reaction, a request or an event reminder.
 * The tick still does the same work; both are safe together because a notification is claimed by one of them only (`for update skip locked`).
 *
 * Pure of Next.js and of the database: the work to run and the clock are passed in, so it is tested directly.
 */
export const DEFAULT_PUSH_LOOP_SECONDS = 15;
const MIN_SECONDS = 5;

/** Seconds between runs, or 0 for "do not run". A development server never runs it: it would push real notifications from a developer's machine. */
export function pushLoopSeconds({ seconds = DEFAULT_PUSH_LOOP_SECONDS, nodeEnv = "production" } = {}) {
  if (nodeEnv !== "production") return 0;
  const n = Math.trunc(Number(seconds));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.max(n, MIN_SECONDS);
}

const KEY = Symbol.for("unisphere.pushLoop");

/**
 * Starts the loop once per process (a second call, or a reloaded module, returns the first one's stop function) and never lets two runs
 * overlap. Returns `stop`, or null when it is switched off.
 */
export function startPushLoop({ run, seconds, nodeEnv, log = console.error, registry = globalThis } = {}) {
  const every = pushLoopSeconds({ seconds, nodeEnv });
  if (!every) return null;
  if (registry[KEY]) return registry[KEY];

  let busy = false;
  const timer = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      await run();
    } catch (err) {
      log("[push-loop] run failed:", err?.message);
    } finally {
      busy = false;
    }
  }, every * 1000);
  timer.unref?.(); // never keeps the process alive on its own

  const stop = () => {
    clearInterval(timer);
    delete registry[KEY];
  };
  registry[KEY] = stop;
  return stop;
}
