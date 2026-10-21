import { NextResponse } from "next/server";
import { getStrictAuthUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { buildDataExport } from "@/lib/privacy/export";
import { recordCompletedAccess } from "@/lib/privacy/requests";

export const dynamic = "force-dynamic";

/**
 * "Download my data": everything the signed-in member authored or set, plus how UniSphere uses it, as JSON. The
 * session is re-checked with the auth server (a revoked session cannot export), the build runs on the member's own
 * session so row level security applies (see lib/privacy/export.js), and a request record is written only after the
 * file has been built successfully.
 */
export async function GET() {
  const user = await getStrictAuthUser();
  if (!user) return new NextResponse("Unauthorised", { status: 401 });
  const limited = await enforceRateLimit("data-export", user.id, { limit: 3, windowSec: 3600 });
  if (limited) return NextResponse.json({ error: limited.error }, { status: 429 });

  let body;
  try {
    body = JSON.stringify(await buildDataExport(await createClient(), user), null, 2);
  } catch (err) {
    console.error("[export] failed:", err?.message);
    return NextResponse.json({ error: "We could not prepare your data just now. Please try again." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
  const reference = await recordCompletedAccess(user.id);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="unisphere-my-data-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
      ...(reference ? { "X-Privacy-Request": reference } : {}),
    },
  });
}
