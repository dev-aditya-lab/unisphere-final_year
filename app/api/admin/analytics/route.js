import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/session";
import { getScope } from "@/lib/admin/scope";
import { parseRange } from "@/lib/admin/range";
import { getSeries } from "@/lib/services/admin";

export const dynamic = "force-dynamic";

const METRICS = ["members", "posts", "comments", "messages", "projects", "events", "reports"];

/** CSV of the daily series shown on /admin/analytics, scoped to what the caller may see. */
export async function GET(request) {
  if (!(await getAuthUser())) return new NextResponse("Unauthorised", { status: 401 });
  const sp = Object.fromEntries(new URL(request.url).searchParams);
  const scope = await getScope("analytics.view", sp.college);
  if (!scope) return new NextResponse("Forbidden", { status: 403 });
  const range = parseRange(sp);
  let series;
  try {
    series = await getSeries(METRICS, { college: scope.college, from: range.from, to: range.to });
  } catch {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const days = series.members.map((r) => r.day);
  const lines = [["date", ...METRICS].join(","), ...days.map((day, i) => [day, ...METRICS.map((m) => series[m][i]?.value ?? 0)].join(","))];
  return new NextResponse(`${lines.join("\n")}\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="unisphere-analytics-${range.from}_${range.to}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
