import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// The catalog changes only when an administrator edits it, so a member's browser may keep it for a few minutes.
const HEADERS = { "Cache-Control": "private, max-age=300" };
const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * GET /api/skills?kind=skill|interest
 * The skills (or interests) the pickers suggest, as managed in Admin -> Skills. Signed-in members only; a member can
 * still type anything that is not listed.
 */
export async function GET(request) {
  let user = null;
  try {
    user = await getAuthUser();
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 503, headers: NO_STORE });
  }
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });

  const kind = new URL(request.url).searchParams.get("kind");
  if (kind !== "skill" && kind !== "interest") return NextResponse.json({ items: [] }, { headers: HEADERS });

  const { data, error } = await (await createClient())
    .from("skill_catalog")
    .select("name, category")
    .eq("kind", kind)
    .eq("is_active", true)
    .order("sort_order")
    .order("name")
    .limit(600);
  if (error) return NextResponse.json({ error: "unavailable" }, { status: 503, headers: NO_STORE });
  return NextResponse.json({ items: data ?? [] }, { headers: HEADERS });
}
