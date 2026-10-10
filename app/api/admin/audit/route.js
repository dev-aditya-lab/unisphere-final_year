import { NextResponse } from "next/server";
import { getAuthUser, hasPermission } from "@/lib/auth/session";
import { listAudit } from "@/lib/services/admin";

export const dynamic = "force-dynamic";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const csvCell = (v) => {
  let s = v == null ? "" : String(typeof v === "object" ? JSON.stringify(v) : v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // never let a cell be interpreted as a spreadsheet formula
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV export of the audit log (up to 5,000 rows) for what the caller's RLS scope allows. */
export async function GET(request) {
  if (!(await getAuthUser())) return new NextResponse("Unauthorised", { status: 401 });
  if (!(await hasPermission("audit.view"))) return new NextResponse("Forbidden", { status: 403 });
  const sp = new URL(request.url).searchParams;
  const from = DATE.test(sp.get("from") ?? "") ? sp.get("from") : null;
  const to = DATE.test(sp.get("to") ?? "") ? sp.get("to") : null;
  const action = (sp.get("action") ?? "").replace(/[^a-z._]/g, "").slice(0, 40) || null;
  const target = /^[0-9a-f-]{8,40}$/i.test(sp.get("target") ?? "") ? sp.get("target") : null;

  const rows = [];
  try {
    for (let page = 1; page <= 5; page++) {
      const res = await listAudit({ action, from, to, target, page, limit: 1000 });
      rows.push(...res.rows);
      if (res.rows.length < 1000) break;
    }
  } catch {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const head = ["time", "actor", "action", "target_type", "target_id", "college_id", "details"];
  const lines = rows.map((r) => [r.created_at, r.actor?.username ?? "", r.action, r.target_type, r.target_id, r.college_id, r.metadata].map(csvCell).join(","));
  return new NextResponse(`${head.join(",")}\n${lines.join("\n")}\n`, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="unisphere-audit-log.csv"', "Cache-Control": "no-store" },
  });
}
