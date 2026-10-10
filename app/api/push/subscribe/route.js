import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/rate-limit";
import { removeSubscription, saveSubscription } from "@/lib/services/push";
import { publicEnv } from "@/lib/env-public";

export const dynamic = "force-dynamic";

// Called by the settings page and by the service worker (when a browser rotates its push endpoint).
// Cookies authenticate it, so a cross-site request must be refused: the Origin has to be this site.
function sameOrigin(request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin || origin === publicEnv.appUrl;
}

async function guard(request) {
  if (!sameOrigin(request)) return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  const user = await getAuthUser();
  if (!user) return { response: NextResponse.json({ error: "Please log in." }, { status: 401 }) };
  const limited = await enforceRateLimit("push-subscribe", user.id, { limit: 30, windowSec: 3600 });
  if (limited) return { response: NextResponse.json({ error: limited.error }, { status: 429 }) };
  return { user };
}

export async function POST(request) {
  const { user, response } = await guard(request);
  if (response) return response;
  const body = await request.json().catch(() => null);
  const res = await saveSubscription({ userId: user.id, subscription: body?.subscription, userAgent: request.headers.get("user-agent") });
  return NextResponse.json(res.ok ? { ok: true } : { error: res.error }, { status: res.ok ? 200 : 400 });
}

export async function DELETE(request) {
  const { response } = await guard(request);
  if (response) return response;
  const body = await request.json().catch(() => null);
  const res = await removeSubscription({ endpoint: body?.endpoint });
  return NextResponse.json(res.ok ? { ok: true } : { error: res.error }, { status: res.ok ? 200 : 400 });
}
