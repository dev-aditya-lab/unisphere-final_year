// Writes the erasure ledger to a file, so erasures can be re-applied after a backup is restored.
//   npm run privacy:export-ledger                 -> erasure-ledger-YYYY-MM-DD.jsonl
//   npm run privacy:export-ledger -- my-file.jsonl
//
// The ledger holds only an opaque account id, when it was erased, and whether the member chose to erase their sent messages.
// Keep the file somewhere that is NOT restored together with the database (an offline copy, a separate bucket), and refresh
// it often: an erasure that is not in the file cannot be re-applied. Treat it as personal data: it is one pseudonymous id per
// erased person. Delete old copies once your backup retention window has passed (docs/DPDP_RETENTION.md).
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(".env.local");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set in .env.local");

const out = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? `erasure-ledger-${new Date().toISOString().slice(0, 10)}.jsonl`;
const db = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });

const rows = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await db.from("erasure_ledger").select("user_ref, status, started_at, completed_at, steps").order("started_at").range(from, from + 999);
  if (error) throw error;
  rows.push(...data);
  if (data.length < 1000) break;
}
writeFileSync(out, rows.map((r) => JSON.stringify({ user_ref: r.user_ref, erased_at: r.completed_at ?? r.started_at, status: r.status, erase_messages: Boolean(r.steps?.erase_messages) })).join("\n") + (rows.length ? "\n" : ""));
console.log(`Wrote ${rows.length} ledger entries to ${out}`);
