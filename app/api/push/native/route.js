import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/rate-limit";
import { isSameOrigin } from "@/lib/security/origin";
import { removeDevice, saveDevice } from "@/lib/services/push";

export const dynamic = "force-dynamic";

// Called by the Android app (components/native, lib/native/push.js) to register or forget this phone for push. Like /api/push/subscribe,
// cookies authenticate it, so a request from another site must be refused: the Origin has to be this site.
async function guard(request) {
  if (!isSameOrigin(request)) return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  const user = await getAuthUser();
  if (!user) return { response: NextResponse.json({ error: "Please log in." }, { status: 401 }) };
  const limited = await enforceRateLimit("push-device", user.id, { limit: 30, windowSec: 3600 });
  if (limited) return { response: NextResponse.json({ error: limited.error }, { status: 429 }) };
  return { user };
}

export async function POST(request) {
  const { user, response } = await guard(request);
  if (response) return response;
  const body = await request.json().catch(() => null);
  const res = await saveDevice({ userId: user.id, input: body });
  return NextResponse.json(res.ok ? { ok: true } : { error: res.error }, { status: res.ok ? 200 : 400 });
}

export async function DELETE(request) {
  const { user, response } = await guard(request);
  if (response) return response;
  const body = await request.json().catch(() => null);
  const res = await removeDevice({ userId: user.id, token: body?.token });
  return NextResponse.json(res.ok ? { ok: true } : { error: res.error }, { status: res.ok ? 200 : 400 });
}
