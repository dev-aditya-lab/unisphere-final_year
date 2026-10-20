// Scroll behaviour check for the messaging thread: when older messages are prepended (by the top sentinel or the
// "Load earlier messages" button), the message being read must not move. Prints one line per round and exits
// non-zero if any round drifted by more than a few pixels.
//
//   NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=... SUPABASE_SECRET_KEY=... \
//   BENCH_BASE_URL=http://localhost:3100 node scripts/perf/messaging-scroll-check.mjs
import { chromium } from "@playwright/test";
import { admin, cleanupUsers, createUser, PASSWORD } from "../../tests/helpers/supabase.js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
if (!/^https?:\/\/(localhost|127\.0\.0\.1)/.test(SUPABASE_URL)) throw new Error(`Refusing to run against ${SUPABASE_URL}: not a local database.`);
const BASE = process.env.BENCH_BASE_URL ?? "http://localhost:3100";
const N = Number(process.env.SCROLL_HISTORY ?? 150);

const alice = await createUser("scroll-a");
const bob = await createUser("scroll-b");
await admin.from("profiles").update({ allow_messages_from: "everyone" }).in("id", [alice.id, bob.id]);
const convId = (await alice.client.rpc("start_direct_conversation", { p_other: bob.id })).data;
// Bodies of different lengths so row heights vary, as they do in a real conversation.
await admin.from("messages").insert(
  Array.from({ length: N }, (_, i) => ({
    conversation_id: convId,
    sender_id: i % 2 ? alice.id : bob.id,
    body: `m${i + 1} ` + "lorem ipsum dolor sit amet ".repeat(1 + (i % 7)),
    created_at: new Date(Date.now() - (N + 2 - i) * 60_000).toISOString(),
  })),
);

let worst = 0;
const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.getByLabel("Email").fill(alice.email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL(/\/feed/);
  await page.goto(`${BASE}/messages/${convId}`);
  await page.getByRole("log").getByText(`m${N} `).waitFor();
  await page.waitForTimeout(800);

  for (let round = 0; round < 6; round++) {
    const r = await page.evaluate(async () => {
      const root = document.querySelector('[role="log"]');
      root.scrollTop = Math.min(150, root.scrollTop);
      const rt = root.getBoundingClientRect().top;
      const rows = [...document.querySelectorAll('[role="log"] li')];
      const li = rows.find((x) => x.getBoundingClientRect().top >= rt + 4);
      const before = Math.round(li.getBoundingClientRect().top - rt);
      const button = [...document.querySelectorAll("button")].find((b) => /earlier messages/i.test(b.textContent));
      button?.click();
      await new Promise((resolve) => setTimeout(resolve, 1800));
      const after = Math.round(li.getBoundingClientRect().top - root.getBoundingClientRect().top);
      return { rowsBefore: rows.length, rowsAfter: document.querySelectorAll('[role="log"] li').length, before, after, drift: after - before };
    });
    worst = Math.max(worst, Math.abs(r.drift));
    console.log(`round ${round}: rows ${r.rowsBefore} -> ${r.rowsAfter}, reading position ${r.before}px -> ${r.after}px (drift ${r.drift}px)`);
    await page.evaluate(() => (document.querySelector('[role="log"]').scrollTop = 0));
    await page.waitForTimeout(100);
  }
} finally {
  await browser.close();
  await cleanupUsers();
}
console.log(worst <= 4 ? `OK: worst drift ${worst}px` : `FAIL: worst drift ${worst}px`);
process.exit(worst <= 4 ? 0 : 1);
