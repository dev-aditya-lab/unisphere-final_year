// Messaging benchmark: drives two real browsers (Alice and Bob) against a running production build and records what a
// member actually experiences. Run it before and after a change and compare the JSON.
//
//   NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=... SUPABASE_SECRET_KEY=... \
//   BENCH_BASE_URL=http://localhost:3100 BENCH_LABEL=baseline node scripts/perf/messaging-bench.mjs
//
// Safe by design: it refuses to run unless Supabase is on localhost (it creates and deletes throw-away users).
// Everything it reports is measured in the browser (timings, requests, WebSocket joins, long tasks); database work
// is read from pg_stat_statements by scripts/perf/db-calls.mjs when available.
import fs from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { chromium } from "@playwright/test";
import { admin, cleanupUsers, createUser, PASSWORD } from "../../tests/helpers/supabase.js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
if (!/^https?:\/\/(localhost|127\.0\.0\.1)/.test(SUPABASE_URL)) throw new Error(`Refusing to run against ${SUPABASE_URL}: not a local database.`);

const BASE = process.env.BENCH_BASE_URL ?? "http://localhost:3100";
const LABEL = process.env.BENCH_LABEL ?? "run";
const HISTORY = Number(process.env.BENCH_HISTORY ?? 120);
const INCOMING = Number(process.env.BENCH_INCOMING ?? 5);
const OUT = process.env.BENCH_OUT ?? path.join("scripts", "perf", "results");

// Database statements issued through the API as a signed-in member (PostgREST runs them as role authenticated), read from pg_stat_statements on the local container.
const PSQL = process.env.BENCH_PSQL ?? 'docker exec supabase_db_unisphere psql -U postgres -d postgres -At';
const psql = (sql) => execSync(`${PSQL} -c "${sql}"`, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
function dbReset() {
  try {
    psql("select pg_stat_statements_reset()");
  } catch {
    /* no container access: database counts are simply not reported */
  }
}
function dbCalls() {
  try {
    return Number(psql("select coalesce(sum(calls),0) from pg_stat_statements s join pg_roles r on r.oid = s.userid where r.rolname in ('authenticated','anon') and s.query not ilike '%pg_stat_statements%'"));
  } catch {
    return null;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pct = (xs, p) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))] : null);
const round = (n) => (n == null ? null : Math.round(n * 10) / 10);
const summary = (xs) => ({ n: xs.length, p50: round(pct(xs, 50)), p95: round(pct(xs, 95)), max: round(Math.max(0, ...xs)) });

/** Everything the page asks the network for, grouped so a "message" has a visible price. */
function classify(req) {
  const url = new URL(req.url());
  const h = req.headers();
  if (url.origin === new URL(SUPABASE_URL).origin) return url.pathname.startsWith("/realtime") ? "supabase-realtime" : "supabase-rest";
  if (url.origin !== new URL(BASE).origin) return "other-origin";
  if (h["next-action"]) return "server-action";
  if (h["rsc"] === "1" || url.searchParams.has("_rsc")) return "rsc-render";
  if (url.pathname.startsWith("/api/")) return "api";
  if (req.resourceType() === "document") return "document";
  if (url.pathname.startsWith("/_next/static")) return "static";
  return "other";
}

class Tracker {
  constructor(page) {
    this.counts = {};
    this.log = [];
    this.joins = [];
    page.on("request", (req) => {
      const kind = classify(req);
      if (kind === "static" || kind === "other") return;
      this.counts[kind] = (this.counts[kind] ?? 0) + 1;
      this.log.push({ kind, method: req.method(), url: req.url().replace(BASE, "").slice(0, 90) });
    });
    page.on("websocket", (ws) => {
      ws.on("framesent", (f) => {
        const s = typeof f.payload === "string" ? f.payload : "";
        if (s.includes("phx_join")) {
          try {
            const arr = JSON.parse(s);
            this.joins.push(Array.isArray(arr) ? arr[2] : JSON.parse(s).topic);
          } catch {
            this.joins.push("unparsed");
          }
        }
      });
    });
  }
  reset() {
    this.counts = {};
    this.log = [];
  }
  snapshot() {
    return { ...this.counts };
  }
}

async function login(page, email) {
  await page.goto(`${BASE}/login`);
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL(/\/feed/, { timeout: 60_000 });
}

const INSTRUMENT = () => {
  window.__bench = { longtasks: [], events: [], loaf: [], submitAt: null };
  try {
    new PerformanceObserver((list) => list.getEntries().forEach((e) => window.__bench.longtasks.push({ d: e.duration, s: e.startTime }))).observe({ type: "longtask", buffered: true });
  } catch {}
  try {
    new PerformanceObserver((list) => list.getEntries().forEach((e) => window.__bench.events.push({ n: e.name, d: e.duration }))).observe({ type: "event", durationThreshold: 16, buffered: true });
  } catch {}
  try {
    new PerformanceObserver((list) => list.getEntries().forEach((e) => window.__bench.loaf.push({ d: e.duration, s: e.scriptsDuration ?? e.blockingDuration ?? 0 }))).observe({ type: "long-animation-frame", buffered: true });
  } catch {}
  document.addEventListener("submit", () => (window.__bench.submitAt = performance.now()), true);
  document.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && e.target?.tagName === "TEXTAREA") window.__bench.submitAt = performance.now(); }, true);
};

const waitText = (page, text, timeout = 30_000) =>
  page.waitForFunction((t) => (document.body?.innerText.includes(t) ? performance.now() : false), text, { timeout, polling: "raf" }).then((h) => h.jsonValue());

async function main() {
  const alice = await createUser("bench-alice");
  const bob = await createUser("bench-bob");
  await admin.from("profiles").update({ allow_messages_from: "everyone" }).in("id", [alice.id, bob.id]);
  const { data: convId, error } = await alice.client.rpc("start_direct_conversation", { p_other: bob.id });
  if (error) throw error;

  // History: alternating senders, one minute apart, ending a minute ago.
  const rows = Array.from({ length: HISTORY }, (_, i) => ({
    conversation_id: convId,
    sender_id: i % 2 ? alice.id : bob.id,
    body: `History message ${i + 1} — the quick brown fox jumps over the lazy dog, https://example.com/page/${i}`,
    created_at: new Date(Date.now() - (HISTORY - i + 1) * 60_000).toISOString(),
  }));
  for (let i = 0; i < rows.length; i += 100) {
    const { error: e } = await admin.from("messages").insert(rows.slice(i, i + 100));
    if (e) throw e;
  }
  const lastHistory = rows[rows.length - 1].body;

  const browser = await chromium.launch();
  const result = { label: LABEL, base: BASE, history: HISTORY, at: new Date().toISOString(), scenarios: {} };
  try {
    const aliceCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await aliceCtx.addInitScript(INSTRUMENT);
    const alicePage = await aliceCtx.newPage();
    const aliceNet = new Tracker(alicePage);
    await login(alicePage, alice.email);

    // 1. Cold open: first load of the conversation URL.
    aliceNet.reset();
    const t0 = Date.now();
    await alicePage.goto(`${BASE}/messages/${convId}`, { waitUntil: "commit" });
    const coldVisible = await waitText(alicePage, lastHistory);
    await alicePage.waitForLoadState("networkidle");
    result.scenarios.coldOpen = { msToLastMessageVisible: round(coldVisible), wallMs: Date.now() - t0, requests: aliceNet.snapshot() };

    // Page weight for this route.
    result.scenarios.coldOpen.jsKBTransferred = await alicePage.evaluate(() =>
      Math.round(performance.getEntriesByType("resource").filter((r) => r.name.includes("/_next/static/") && r.name.endsWith(".js")).reduce((s, r) => s + (r.encodedBodySize || 0), 0) / 1024));

    // 2. Revisit: leave the thread, come back by tapping it in the list (client navigation).
    await alicePage.goto(`${BASE}/messages`, { waitUntil: "networkidle" });
    aliceNet.reset();
    const link = alicePage.locator(`a[href="/messages/${convId}"]`).first();
    await link.waitFor();
    const clickedAt = await alicePage.evaluate(() => performance.now());
    await link.click();
    const revisitVisible = await waitText(alicePage, lastHistory);
    await alicePage.waitForLoadState("networkidle");
    result.scenarios.revisitByClick = { msToLastMessageVisible: round(revisitVisible - clickedAt), requests: aliceNet.snapshot() };

    // 3. Typing in a long thread: browser event-timing entries (>16 ms) and long tasks while typing 60 characters.
    const box = alicePage.locator("textarea").first();
    await box.click();
    await alicePage.evaluate(() => { window.__bench.events.length = 0; window.__bench.longtasks.length = 0; window.__bench.loaf.length = 0; });
    const typedAt = Date.now();
    await alicePage.keyboard.type("hello this is a long typing test for latency of keys ... 1234567890", { delay: 8 });
    const typeWall = Date.now() - typedAt;
    await sleep(300);
    const typed = await alicePage.evaluate(() => ({ events: window.__bench.events, longtasks: window.__bench.longtasks, loaf: window.__bench.loaf }));
    result.scenarios.typing = {
      chars: 66,
      wallMs: typeWall,
      slowEvents: summary(typed.events.map((e) => e.d)),
      longTasks: { n: typed.longtasks.length, totalMs: round(typed.longtasks.reduce((s, t) => s + t.d, 0)) },
      // Frames that took over 50 ms while typing, and the script time in them (Chrome long-animation-frame API).
      longFrames: { n: typed.loaf.length, scriptMs: round(typed.loaf.reduce((s, f) => s + f.s, 0)) },
    };
    await box.fill("");

    // 4. Send: from the Enter key to the bubble being in the DOM, then to "confirmed" (no "Sending…" left).
    aliceNet.reset();
    dbReset();
    const marker = `bench-send-${Date.now().toString(36)}`;
    await box.fill(marker);
    await alicePage.evaluate(() => (window.__bench.submitAt = null));
    await alicePage.keyboard.press("Enter");
    const bubbleAt = await waitText(alicePage, marker);
    const submitAt = await alicePage.evaluate(() => window.__bench.submitAt);
    // Confirmed = neither the old "Sending…" text nor the new clock icon is left in the thread.
    await alicePage.waitForFunction(() => !document.body.innerText.includes("Sending") && !document.querySelector('[aria-label="Sending"]'), null, { timeout: 30_000, polling: "raf" });
    const confirmedAt = await alicePage.evaluate(() => performance.now());
    await alicePage.waitForLoadState("networkidle");
    result.scenarios.send = {
      msEnterToBubble: submitAt == null ? null : round(bubbleAt - submitAt),
      msEnterToConfirmed: submitAt == null ? null : round(confirmedAt - submitAt),
      requests: aliceNet.snapshot(),
    };
    const { data: saved } = await admin.from("messages").select("id").eq("conversation_id", convId).eq("body", marker);
    result.scenarios.send.rowsInDatabase = saved?.length ?? 0; // must be exactly 1
    result.scenarios.send.dbStatements = dbCalls();

    // 5. Incoming: Bob's client inserts; how long until Alice's bubble, and what Alice's browser does meanwhile.
    const incomingMs = [];
    const dbPerIncoming = [];
    const perMessage = [];
    for (let i = 0; i < INCOMING; i++) {
      await sleep(1500);
      aliceNet.reset();
      dbReset();
      const text = `bench-in-${i}-${Date.now().toString(36)}`;
      const waiting = alicePage.waitForFunction((t) => (document.body?.innerText.includes(t) ? Date.now() : false), text, { timeout: 30_000, polling: "raf" });
      const sentAt = Date.now();
      const { error: sendError } = await bob.client.from("messages").insert({ conversation_id: convId, sender_id: bob.id, body: text });
      if (sendError) throw sendError;
      const seenAt = await (await waiting).jsonValue();
      incomingMs.push(seenAt - sentAt);
      await sleep(2500); // let the follow-up work (refresh, reads, refetches) show up
      perMessage.push(aliceNet.snapshot());
      dbPerIncoming.push(dbCalls());
    }
    const total = {};
    perMessage.forEach((c) => Object.entries(c).forEach(([k, v]) => (total[k] = (total[k] ?? 0) + v)));
    result.scenarios.incoming = {
      msBobInsertToAliceBubble: summary(incomingMs),
      dbStatementsPerMessage: round(dbPerIncoming.reduce((a, b) => a + (b ?? 0), 0) / INCOMING),
      requestsPerMessage: Object.fromEntries(Object.entries(total).map(([k, v]) => [k, round(v / INCOMING)])),
    };

    // 6. Reading older messages must not be yanked to the bottom by a new message.
    const log = alicePage.locator('[role="log"]').first();
    await log.evaluate((el) => (el.scrollTop = 0));
    await sleep(500);
    const before = await log.evaluate((el) => ({ top: el.scrollTop, h: el.scrollHeight, client: el.clientHeight }));
    const text = `bench-while-reading-${Date.now().toString(36)}`;
    await bob.client.from("messages").insert({ conversation_id: convId, sender_id: bob.id, body: text });
    await sleep(2500);
    const after = await log.evaluate((el) => ({ top: el.scrollTop, h: el.scrollHeight, client: el.clientHeight }));
    result.scenarios.incomingWhileReadingOlder = { scrollTopBefore: before.top, scrollTopAfter: after.top, keptPosition: Math.abs(after.top - before.top) < 120 };

    // 7. Loading earlier messages must keep the message you were reading exactly where it was. The row is picked in
    // the same page task as the scroll jump (before any older page can land) and measured again after it did.
    const drift = await alicePage.evaluate(async () => {
      const root = document.querySelector('[role="log"]');
      root.scrollTop = Math.min(150, root.scrollTop);
      const rt = root.getBoundingClientRect().top;
      const rows = [...document.querySelectorAll('[role="log"] li')];
      const li = rows.find((x) => x.getBoundingClientRect().top >= rt + 4);
      if (!li) return null;
      const before = Math.round(li.getBoundingClientRect().top - rt);
      const countBefore = rows.length;
      const button = [...document.querySelectorAll("button")].find((b) => /earlier messages/i.test(b.textContent));
      button?.click();
      await new Promise((resolve) => setTimeout(resolve, 2500));
      const after = Math.round(li.isConnected ? li.getBoundingClientRect().top - root.getBoundingClientRect().top : NaN);
      return { countBefore, countAfter: document.querySelectorAll('[role="log"] li').length, before, after };
    });
    result.scenarios.loadOlder = drift && Number.isFinite(drift.after)
      ? { messagesBefore: drift.countBefore, messagesAfter: drift.countAfter, anchorDriftPx: drift.after - drift.before, anchorKept: Math.abs(drift.after - drift.before) <= 4 }
      : { anchorDriftPx: null, anchorKept: false, note: "row was replaced or removed" };


    // Whole-session facts.
    result.realtimeJoins = aliceNet.joins;
    result.distinctRealtimeTopics = [...new Set(aliceNet.joins)].length;
    result.totalRealtimeJoins = aliceNet.joins.length;
    result.longTasksTotal = await alicePage.evaluate(() => ({ n: window.__bench.longtasks.length, ms: Math.round(window.__bench.longtasks.reduce((s, t) => s + t.d, 0)) }));
  } finally {
    await browser.close();
    await cleanupUsers();
  }

  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, `messaging-${LABEL}.json`);
  fs.writeFileSync(file, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  console.log(`\nSaved ${file}`);
}

main().catch(async (e) => {
  console.error(e);
  await cleanupUsers().catch(() => {});
  process.exit(1);
});
