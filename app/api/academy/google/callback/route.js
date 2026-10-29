import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { openSecret } from "@/lib/security/secret-box";
import { connectWithCode } from "@/lib/services/academy-google";
import { publicEnv } from "@/lib/env-public";
import { STATE_COOKIE } from "@/lib/academy/google-event";

export const dynamic = "force-dynamic";

const BACK = "/admin/academy/settings";

const same = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};

/**
 * Where Google sends the owner back to. Accepts the return only when the `state` Google echoes is the one sealed into this browser's
 * cookie, made for this same signed-in person within the last ten minutes, and the person still may change Academy settings.
 * Whatever happens, the browser lands on the settings page with a short word saying how it went; no detail from Google is shown.
 */
export async function GET(request) {
  const done = (word) => {
    const res = NextResponse.redirect(new URL(`${BACK}?google=${word}`, publicEnv.appUrl), { headers: { "Cache-Control": "no-store" } });
    res.cookies.set(STATE_COOKIE, "", { path: "/api/academy/google", maxAge: 0 });
    return res;
  };
  const user = await getAuthUser();
  if (!user) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(BACK)}`, publicEnv.appUrl));
  const limit = await rateLimit({ key: `acad-google-callback:${user.id}`, limit: 10, windowSec: 600 });
  if (!limit.ok) return done("slow_down");

  const params = new URL(request.url).searchParams;
  if (params.get("error")) return done("cancelled");
  const code = params.get("code");
  const state = params.get("state");
  let saved = null;
  try {
    saved = JSON.parse(openSecret(request.cookies.get(STATE_COOKIE)?.value ?? "", "academy-google-state") ?? "null");
  } catch {
    saved = null;
  }
  if (!code || !state || !saved || !same(saved.s, state) || saved.u !== user.id || !(saved.e > Date.now())) return done("invalid");
  const { data: allowed } = await (await createClient()).rpc("has_permission", { p_permission: "academy.settings.manage", p_college_id: null });
  if (!allowed) return done("denied");

  const result = await connectWithCode(code, user.id);
  return done(result.ok ? "connected" : result.reason);
}
