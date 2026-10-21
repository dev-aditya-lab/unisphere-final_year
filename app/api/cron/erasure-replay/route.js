import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { executeAccountDeletion } from "@/lib/services/account-deletion";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const body = z.object({
  entries: z.array(z.object({ user_ref: z.uuid(), erase_messages: z.boolean().optional() })).min(1).max(25),
});

function authorised(request) {
  const secret = getEnv().CRON_SECRET;
  if (!secret) return false;
  const given = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * After a backup is restored, erase again every account that had already been erased (docs/DPDP_RETENTION.md).
 * `scripts/privacy-replay-erasures.mjs` calls this with batches of ledger entries that were exported BEFORE the restore.
 * An entry whose account does not exist is left alone; one that does exist is erased exactly as a normal erasure is.
 * Header-only authorisation (no query secret): this endpoint deletes accounts.
 */
export async function POST(request) {
  if (!authorised(request)) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });

  const db = createAdminClient();
  const result = { erased: 0, absent: 0, failed: [] };
  for (const e of parsed.data.entries) {
    const { data } = await db.auth.admin.getUserById(e.user_ref);
    if (!data?.user) {
      result.absent += 1;
      continue;
    }
    // The restored database may have no deletion request for them: the erasure runs from the ledger entry alone.
    const res = await executeAccountDeletion(e.user_ref, { requestId: null, eraseMessages: e.erase_messages ?? false });
    if (res.ok) result.erased += 1;
    else result.failed.push(e.user_ref);
  }
  return NextResponse.json({ ok: result.failed.length === 0, ...result });
}
