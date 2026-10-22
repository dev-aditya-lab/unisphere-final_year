import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthUnavailableError, getAuthUser } from "@/lib/auth/session";
import { isSameOrigin } from "@/lib/security/origin";
import { isFlagEnabled } from "@/lib/settings";
import { cursorSchema } from "@/lib/cursor";

// Private conversation data must never sit in a shared cache (a CDN, a proxy, the service worker). `Vary: Cookie`
// is belt and braces for caches that ignore `private`.
const PRIVATE = { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" };

export function json(body, status = 200, headers = {}) {
  return NextResponse.json(body, { status, headers: { ...PRIVATE, ...headers } });
}

export const uuid = z.uuid();

/** Reads `<prefix>Ts` / `<prefix>Id` from the query string. Returns null when absent, `false` when malformed. */
export function readCursor(searchParams, prefix) {
  const ts = searchParams.get(`${prefix}Ts`);
  const id = searchParams.get(`${prefix}Id`);
  if (!ts && !id) return null;
  const parsed = cursorSchema.safeParse({ ts, id });
  return parsed.success ? parsed.data : false;
}

/**
 * Common gate for the messaging endpoints: same-origin for writes (cookie-authenticated requests), a signed-in
 * member, and the feature switch. The identity comes from the verified session, never from the request body.
 * No database query: the session claims are checked locally, and every data access that follows runs under the
 * caller's own row level security.
 */
export async function guard(request, { write = false } = {}) {
  if (write && !isSameOrigin(request)) return { response: json({ ok: false, error: "Forbidden", code: "forbidden" }, 403) };
  let user;
  try {
    user = await getAuthUser();
  } catch (error) {
    if (error instanceof AuthUnavailableError) return { response: json({ ok: false, error: error.message, code: "unavailable" }, 503) };
    throw error;
  }
  if (!user) return { response: json({ ok: false, error: "Please log in.", code: "unauthenticated" }, 401) };
  if (!(await isFlagEnabled("messaging"))) return { response: json({ ok: false, error: "Messaging is turned off right now.", code: "disabled" }, 403) };
  return { user };
}

export const unavailable = () => json({ ok: false, error: "Messages are temporarily unavailable.", code: "unavailable" }, 503);
