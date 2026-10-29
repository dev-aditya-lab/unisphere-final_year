import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { publicEnv } from "@/lib/env-public";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * The Join button. The database decides everything: whether this person may attend this class, whether the link is open yet (from an
 * hour before the start until two hours after the end), and it records the join. The link itself is never put on a page; only a person
 * who passes those checks is sent to it, and only if it is a plain https address.
 */
export async function GET(_request, { params }) {
  const { id } = await params;
  const back = (word) => NextResponse.redirect(new URL(`/academy/dashboard?class=${word}`, publicEnv.appUrl), { headers: NO_STORE });
  const user = await getAuthUser();
  if (!user) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent("/academy/dashboard")}`, publicEnv.appUrl), { headers: NO_STORE });
  if (!z.uuid().safeParse(id).success) return back("not_found");
  const limit = await rateLimit({ key: `acad-join:${user.id}`, limit: 40, windowSec: 600 });
  if (!limit.ok) return back("slow_down");

  const { data, error } = await (await createClient()).rpc("academy_join_session", { p_session: id });
  if (error || !data?.ok) return back(data?.error === "not_open" ? "not_open" : "not_allowed");
  if (!/^https:\/\/[^\s]+$/.test(String(data.url))) return back("not_open");
  return NextResponse.redirect(data.url, { status: 303, headers: NO_STORE });
}
