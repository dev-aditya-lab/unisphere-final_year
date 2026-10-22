import { NextResponse } from "next/server";
import { getAuthUser, hasPermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const csvCell = (v) => {
  let s = v == null ? "" : String(typeof v === "object" ? JSON.stringify(v) : v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // never let a cell be read as a spreadsheet formula
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * Pseudonymous CSV of referrals (up to 20,000 rows): ids, status, dates, reward and abuse-signal names. No usernames, emails or
 * network data leave the database through this route. The database function re-checks the permission and writes the audit entry.
 */
export async function GET(request) {
  const user = await getAuthUser();
  if (!user) return new NextResponse("Unauthorised", { status: 401 });
  if (!(await hasPermission("referrals.manage"))) return new NextResponse("Forbidden", { status: 403 });
  const limited = await enforceRateLimit("referral-export", user.id, { limit: 6, windowSec: 600 });
  if (limited) return new NextResponse("Too many exports. Try again in a few minutes.", { status: 429 });

  const sp = new URL(request.url).searchParams;
  const from = DATE.test(sp.get("from") ?? "") ? sp.get("from") : null;
  const to = DATE.test(sp.get("to") ?? "") ? sp.get("to") : null;
  const { data, error } = await (await createClient()).rpc("referral_admin_export", { p_from: from, p_to: to });
  if (error) return new NextResponse("Forbidden", { status: 403 });

  const head = ["referral_id", "status", "registered_at", "qualified_at", "reward_amount", "signals"];
  const lines = (data ?? []).map((r) => [r.referral_id, r.status, r.registered_at, r.qualified_at, r.reward_amount, (r.signals ?? []).join("|")].map(csvCell).join(","));
  return new NextResponse(`${head.join(",")}\n${lines.join("\n")}\n`, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="unisphere-referrals.csv"', "Cache-Control": "no-store" },
  });
}
