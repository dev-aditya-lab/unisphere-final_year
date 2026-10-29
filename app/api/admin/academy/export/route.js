import { NextResponse } from "next/server";
import { getAuthUser, hasPermission } from "@/lib/auth/session";
import { rateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { toMinor } from "@/lib/academy/money";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };
const MAX_ROWS = 5000;

// A cell that starts with = + - @ could run as a formula when the file is opened in a spreadsheet; a leading apostrophe stops that.
const cell = (v) => {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (header, list) => [header.join(","), ...list.map((r) => header.map((h) => cell(r[h])).join(","))].join("\r\n");

/** CSV exports for staff with the export permission (and the permission that shows the data). Every export is written to the audit log. */
export async function GET(request) {
  const user = await getAuthUser();
  if (!user) return new NextResponse("Not signed in", { status: 401, headers: NO_STORE });
  if (!(await hasPermission("academy.export"))) return new NextResponse("Forbidden", { status: 403, headers: NO_STORE });
  const limit = await rateLimit({ key: `acad-export:${user.id}`, limit: 20, windowSec: 3600 });
  if (!limit.ok) return new NextResponse("Too many exports", { status: 429, headers: NO_STORE });

  const sp = new URL(request.url).searchParams;
  const kind = sp.get("kind");
  const supabase = await createClient();
  let header, list;

  if (kind === "orders") {
    const uuid = (v) => (v && /^[0-9a-f-]{36}$/.test(v) ? v : null);
    const date = (v, plus = 0) => (v && !Number.isNaN(Date.parse(v)) ? new Date(Date.parse(v) + plus).toISOString() : null);
    const { data, error } = await supabase.rpc("academy_admin_orders", {
      p_search: sp.get("q") || null, p_status: sp.get("status") || null, p_course: uuid(sp.get("course")), p_from: date(sp.get("from")), p_to: date(sp.get("to"), 86_400_000),
      p_min: sp.get("min") ? toMinor(sp.get("min")) : null, p_max: sp.get("max") ? toMinor(sp.get("max")) : null, p_limit: MAX_ROWS, p_offset: 0,
    });
    if (error) return new NextResponse("Forbidden", { status: 403, headers: NO_STORE });
    header = ["order_no", "created_at", "paid_at", "status", "buyer_name", "buyer_username", "buyer_email", "course_code", "course_title", "currency", "list_minor", "sale_discount_minor", "coupon_code", "coupon_discount_minor", "tax_mode", "tax_rate_bps", "tax_minor", "total_minor", "refunded_minor", "provider", "provider_order_id", "provider_payment_id"];
    list = data ?? [];
  } else if (kind === "certificates") {
    const { data, error } = await supabase.rpc("academy_admin_certificates", { p_limit: MAX_ROWS, p_offset: 0 });
    if (error) return new NextResponse("Forbidden", { status: 403, headers: NO_STORE });
    header = ["certificate_id", "status", "recipient_name", "course_code", "course_title", "template_name", "template_version", "issued_at", "issued_by_name", "revoked_at", "replaces_certificate_id", "verify_count"];
    list = data ?? [];
  } else if (kind === "enrollments") {
    const { data, error } = await supabase.rpc("academy_admin_enrollments", { p_limit: MAX_ROWS, p_offset: 0 });
    if (error) return new NextResponse("Forbidden", { status: 403, headers: NO_STORE });
    header = ["full_name", "username", "course_code", "course_title", "cohort_name", "status", "source", "enrolled_at", "access_expires_at", "completed_at", "completion_pct", "certificate_status"];
    list = data ?? [];
  } else {
    return new NextResponse("Unknown export", { status: 400, headers: NO_STORE });
  }

  await supabase.rpc("academy_log_export", { p_kind: kind, p_rows: list.length });
  return new NextResponse(`﻿${csv(header, list)}`, {
    headers: { ...NO_STORE, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="academy-${kind}-${new Date().toISOString().slice(0, 10)}.csv"`, "X-Content-Type-Options": "nosniff" },
  });
}
