// Re-applies erasures after a backup restore, so a restore cannot bring an erased account back.
//   npm run privacy:replay-erasures -- erasure-ledger-2026-10-21.jsonl [--dry-run]
//
// Do this BEFORE the restored service is opened to members: keep it in maintenance mode, restore the database, run this with
// a ledger file exported before the restore (scripts/privacy-export-erasure-ledger.mjs), then reopen. For each entry whose
// account exists again in the restored database, the app erases it exactly as a normal erasure does (stored files, derived
// data, sign-in account). Entries whose account is absent are left alone. Safe to run twice.
//
// It talks to a running copy of the app (WORKER_TARGET_URL or NEXT_PUBLIC_APP_URL) with CRON_SECRET, in batches of 25.
import { readFileSync } from "node:fs";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* the environment may already be set */
}
const file = process.argv.slice(2).find((a) => !a.startsWith("--"));
const dry = process.argv.includes("--dry-run");
const base = (process.env.WORKER_TARGET_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
const secret = process.env.CRON_SECRET;
if (!file) {
  console.error("Usage: npm run privacy:replay-erasures -- ledger.jsonl [--dry-run]");
  process.exit(1);
}
if (!secret && !dry) {
  console.error("CRON_SECRET is not set.");
  process.exit(1);
}

const entries = readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
console.log(`${entries.length} ledger entries in ${file}${dry ? " (dry run: nothing will be sent)" : ` -> ${base}`}`);
if (dry) process.exit(0);

const totals = { erased: 0, absent: 0, failed: 0 };
for (let i = 0; i < entries.length; i += 25) {
  const batch = entries.slice(i, i + 25).map((e) => ({ user_ref: e.user_ref, erase_messages: Boolean(e.erase_messages) }));
  const res = await fetch(`${base}/api/cron/erasure-replay`, { method: "POST", headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" }, body: JSON.stringify({ entries: batch }) });
  const out = await res.json().catch(() => ({}));
  if (!res.ok && res.status !== 200) {
    console.error(`Batch ${i / 25 + 1} failed: HTTP ${res.status}`, out);
    process.exit(1);
  }
  totals.erased += out.erased ?? 0;
  totals.absent += out.absent ?? 0;
  totals.failed += out.failed?.length ?? 0;
  console.log(`batch ${i / 25 + 1}: erased ${out.erased}, absent ${out.absent}, failed ${out.failed?.length ?? 0}`);
}
console.log(`Done. Erased again: ${totals.erased}. Already absent: ${totals.absent}. Failed: ${totals.failed}.`);
process.exit(totals.failed ? 2 : 0);
