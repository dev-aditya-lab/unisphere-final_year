// Navigation benchmark: what a member feels when they tap a link.
//
//   NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=... SUPABASE_SECRET_KEY=... \
//   BENCH_BASE_URL=http://localhost:3100 BENCH_LABEL=baseline node scripts/perf/nav-bench.mjs
//
// Each scenario loads a start page, waits for idle (so prefetching has had its chance, as for a person who looked at
// the page for a moment), then taps a link from inside the page and measures, in the browser:
//   feedback  ms from the tap until the screen first changes (skeleton, pending dot, new page: anything)
//   ready     ms from the tap until the destination is on screen and no loading placeholder is left
// The browser is throttled to a mid-range phone (CPU x4, 4G-like network). Server work is local, so absolute numbers
// are optimistic; compare runs with each other, and expect production to add its own network round trips on top.
// Safe by design: refuses to run unless Supabase is on localhost (it creates and deletes a throw-away user).
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import { cleanupUsers, createUser, PASSWORD } from "../../tests/helpers/supabase.js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
if (!/^https?:\/\/(localhost|127\.0\.0\.1)/.test(SUPABASE_URL)) throw new Error(`Refusing to run against ${SUPABASE_URL}: not a local database.`);

const BASE = process.env.BENCH_BASE_URL ?? "http://localhost:3100";
const LABEL = process.env.BENCH_LABEL ?? "run";
const RUNS = Number(process.env.BENCH_RUNS ?? 5);
const OUT = process.env.BENCH_OUT ?? path.join("scripts", "perf", "results");

// start: where the member is; tap: a CSS selector for the link they press; expect: the path they should land on.
const SCENARIOS = [
  { name: "feed -> Explore (nav)", start: "/feed", tap: 'nav a[href="/explore"]', expect: /^\/explore/ },
  { name: "feed -> Messages (nav)", start: "/feed", tap: 'nav a[href="/messages"]', expect: /^\/messages$/ },
  { name: "feed -> Projects (nav)", start: "/feed", tap: 'nav a[href="/projects"]', expect: /^\/projects$/ },
  { name: "feed -> Events (nav)", start: "/feed", tap: 'nav a[href="/events"]', expect: /^\/events$/ },
  { name: "feed -> Communities (nav)", start: "/feed", tap: 'nav a[href="/communities"]', expect: /^\/communities$/ },
  { name: "feed -> post (card)", start: "/feed", tap: 'main a[href^="/posts/"]', expect: /^\/posts\// },
  { name: "feed -> profile (author)", start: "/feed", tap: 'main a[href^="/u/"]', expect: /^\/u\// },
  { name: "projects -> project", start: "/projects", tap: 'main a[href^="/projects/"]:not([href$="/new"])', expect: /^\/projects\/[^/]+$/ },
  { name: "events -> event", start: "/events", tap: 'main a[href^="/events/"]:not([href$="/new"])', expect: /^\/events\/[^/]+$/ },
  { name: "communities -> community", start: "/communities", tap: 'main a[href^="/communities/"]:not([href$="/new"])', expect: /^\/communities\/[^/]+$/ },
];

const pct = (xs, p) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))] : null);
const round = (n) => (n == null ? null : Math.round(n));

async function login(page, email) {
  await page.goto(`${BASE}/login`);
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL(/\/feed/, { timeout: 60_000 });
}

/** Runs in the page: press the link and report when the screen first changed and when the destination was ready. */
const TAP = ({ selector, expect, flags }) =>
  new Promise((resolve) => {
    const link = document.querySelector(selector);
    if (!link) return resolve({ error: `no element for ${selector}` });
    const re = new RegExp(expect, flags);
    let feedback = null;
    const observer = new MutationObserver(() => {
      if (feedback === null) feedback = performance.now() - t0;
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
    const t0 = performance.now();
    link.click();
    const poll = () => {
      const loading = document.querySelector('[role="status"][aria-label="Loading"]');
      if (re.test(location.pathname) && !loading && document.querySelector("main h1, main h2, main article")) {
        observer.disconnect();
        return resolve({ feedback: feedback ?? performance.now() - t0, ready: performance.now() - t0, path: location.pathname });
      }
      if (performance.now() - t0 > 20_000) {
        observer.disconnect();
        return resolve({ error: `timed out on ${location.pathname}`, feedback });
      }
      requestAnimationFrame(poll);
    };
    requestAnimationFrame(poll);
  });

const user = await createUser("navbench");
const browser = await chromium.launch();
const results = [];
let rscRequests = 0;
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await login(page, user.email);
  // Requests for server-component payloads made while a start page loads and sits idle: prefetching has a price.
  page.on("request", (req) => {
    if (req.url().includes("_rsc=")) rscRequests++;
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 80, downloadThroughput: (12 * 1024 * 1024) / 8, uploadThroughput: (6 * 1024 * 1024) / 8 });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

  for (const s of SCENARIOS.filter((x) => !process.env.BENCH_ONLY || x.name.includes(process.env.BENCH_ONLY))) {
    const feedback = [];
    const ready = [];
    const errors = [];
    const prefetches = [];
    for (let i = 0; i < RUNS + 1; i++) {
      rscRequests = 0;
      await page.goto(`${BASE}${s.start}`, { waitUntil: "load" });
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.waitForTimeout(2500); // the prefetch window
      const prefetched = rscRequests;
      const r = await page.evaluate(TAP, { selector: s.tap, expect: s.expect.source, flags: s.expect.flags });
      if (r.error) {
        errors.push(r.error);
        continue;
      }
      if (i === 0) continue; // the first run warms the browser cache and server; it is not counted
      prefetches.push(prefetched);
      feedback.push(r.feedback);
      ready.push(r.ready);
    }
    const row = {
      scenario: s.name,
      runs: feedback.length,
      feedback_p50: round(pct(feedback, 50)),
      feedback_max: round(Math.max(0, ...feedback)),
      ready_p50: round(pct(ready, 50)),
      ready_max: round(Math.max(0, ...ready)),
      prefetch_requests_p50: round(pct(prefetches, 50)),
      ...(errors.length ? { errors: [...new Set(errors)] } : {}),
    };
    results.push(row);
    console.log(`${s.name.padEnd(30)} feedback p50 ${String(row.feedback_p50).padStart(5)} ms   ready p50 ${String(row.ready_p50).padStart(5)} ms   rsc prefetches ${row.prefetch_requests_p50}${errors.length ? `   (${errors.length} failed)` : ""}`);
  }
} finally {
  await browser.close();
  await cleanupUsers();
}

fs.mkdirSync(OUT, { recursive: true });
const file = path.join(OUT, `nav-${LABEL}.json`);
fs.writeFileSync(file, JSON.stringify({ label: LABEL, base: BASE, runs: RUNS, throttle: "cpu x4, 80 ms RTT, 12/6 Mbit", results }, null, 2));
console.log(`wrote ${file}`);
