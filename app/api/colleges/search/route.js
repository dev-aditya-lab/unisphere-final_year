import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/session";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { searchCollegesSchema } from "@/lib/validators/college";
import { searchColleges } from "@/lib/services/colleges";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * GET /api/colleges/search?q=engineering
 * Autocomplete for the college picker. Signed-in members only, rate limited, never cached.
 * A GET (rather than a Server Action) so a newer keystroke can abort the request still in flight.
 */
export async function GET(request) {
  let user = null;
  try {
    user = await getAuthUser();
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 503, headers: NO_STORE });
  }
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });

  const url = new URL(request.url);
  const parsed = searchCollegesSchema.safeParse({ q: url.searchParams.get("q") ?? "", limit: url.searchParams.get("limit") ?? undefined });
  if (!parsed.success) return NextResponse.json({ results: [] }, { headers: NO_STORE });

  const ip = await getClientIp();
  const limit = await rateLimit({ key: `college-search:${user.id}:${ip}`, limit: 120, windowSec: 60 });
  if (!limit.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { ...NO_STORE, "Retry-After": String(limit.resetSec) } });
  }

  const res = await searchColleges(parsed.data.q, parsed.data.limit);
  if (!res.ok) return NextResponse.json({ error: "unavailable" }, { status: 503, headers: NO_STORE });
  return NextResponse.json({ results: res.results }, { headers: NO_STORE });
}
