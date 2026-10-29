import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { sealSecret } from "@/lib/security/secret-box";
import { googleAuthUrl } from "@/lib/services/academy-google";
import { publicEnv } from "@/lib/env-public";
import { STATE_COOKIE } from "@/lib/academy/google-event";

export const dynamic = "force-dynamic";

const BACK = "/admin/academy/settings";

/**
 * Starts connecting the Academy's Google account (Calendar + Meet). Only someone who may change Academy settings can start it.
 * A random `state` is sent to Google and also sealed into a short-lived cookie that only this browser holds; the callback accepts
 * a return from Google only if both match, so a link made by somebody else cannot connect an account to this Academy.
 */
export async function GET() {
  const user = await getAuthUser();
  const to = (q) => NextResponse.redirect(new URL(`${BACK}?google=${q}`, publicEnv.appUrl), { headers: { "Cache-Control": "no-store" } });
  if (!user) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(BACK)}`, publicEnv.appUrl));
  const { data: allowed } = await (await createClient()).rpc("has_permission", { p_permission: "academy.settings.manage", p_college_id: null });
  if (!allowed) return to("denied");
  const limit = await rateLimit({ key: `acad-google-connect:${user.id}`, limit: 10, windowSec: 600 });
  if (!limit.ok) return to("slow_down");

  const state = randomBytes(24).toString("base64url");
  const url = googleAuthUrl(state);
  if (!url) return to("not_configured");
  const res = NextResponse.redirect(url, { headers: { "Cache-Control": "no-store" } });
  res.cookies.set(STATE_COOKIE, sealSecret(JSON.stringify({ s: state, u: user.id, e: Date.now() + 10 * 60_000 }), "academy-google-state"), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/academy/google", maxAge: 600,
  });
  return res;
}
