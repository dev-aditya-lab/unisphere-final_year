import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthUser } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/rate-limit";
import { exportUser } from "@/lib/services/admin";

export const dynamic = "force-dynamic";

/**
 * Permitted data export for one member (profile, counts, post list, moderation history, roles; never messages or
 * credentials). Global administrators only: the database function refuses everyone else and writes the audit entry
 * itself, so there is no way to export without a record.
 */
export async function GET(_request, { params }) {
  const { userId } = await params;
  if (!z.uuid().safeParse(userId).success) return new NextResponse("Not found", { status: 404 });
  const user = await getAuthUser();
  if (!user) return new NextResponse("Unauthorised", { status: 401 });
  const limited = await enforceRateLimit("admin-export", user.id, { limit: 10, windowSec: 3600 });
  if (limited) return new NextResponse("Too many exports. Try again later.", { status: 429 });

  const res = await exportUser(userId);
  if (!res.ok) return new NextResponse(res.code === "not_found" ? "Not found" : "Forbidden", { status: res.code === "not_found" ? 404 : 403 });
  return new NextResponse(JSON.stringify(res.data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="unisphere-member-${userId}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
