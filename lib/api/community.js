import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthUnavailableError, getAuthUser } from "@/lib/auth/session";
import { isSameOrigin } from "@/lib/security/origin";
import { isFlagEnabled } from "@/lib/settings";
import { enforceRateLimit } from "@/lib/rate-limit";
import { json, readCursor, uuid } from "@/lib/api/messaging";

export { json, readCursor, uuid };

const MAX_JSON_BYTES = 64 * 1024;

/**
 * Common gate for the community endpoints: same-origin for writes (the session is a cookie), a signed-in member, and the
 * feature switch. The identity comes from the verified session, never from the request. Every data access that follows runs
 * under the caller's own row level security, and every write is a database function that checks the caller again.
 */
export async function communityGuard(request, { write = false, limit = null } = {}) {
  if (write && !isSameOrigin(request)) return { response: json({ ok: false, error: "Forbidden", code: "forbidden" }, 403) };
  let user;
  try {
    user = await getAuthUser();
  } catch (error) {
    if (error instanceof AuthUnavailableError) return { response: json({ ok: false, error: error.message, code: "unavailable" }, 503) };
    throw error;
  }
  if (!user) return { response: json({ ok: false, error: "Please log in.", code: "unauthenticated" }, 401) };
  if (!(await isFlagEnabled("communities"))) return { response: json({ ok: false, error: "Communities are turned off right now.", code: "disabled" }, 403) };
  if (limit) {
    const limited = await enforceRateLimit(limit.scope, user.id, { limit: limit.limit, windowSec: limit.windowSec });
    if (limited) return { response: json({ ok: false, error: limited.error, code: "rate_limited" }, 429, { "Retry-After": "30" }) };
  }
  return { user };
}

/** Reads a small JSON body. Returns undefined for anything that is not valid, too large or not JSON. */
export async function readJson(request) {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_JSON_BYTES) return undefined;
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

export const notFound = () => json({ ok: false, error: "Not found", code: "not_found" }, 404);
export const unavailable = () => json({ ok: false, error: "That is temporarily unavailable.", code: "unavailable" }, 503);

/** A failed service result as an HTTP answer (status from the mapped database error). */
export function failed(res) {
  return json(
    { ok: false, error: res.error, code: res.code, ...(res.retryAfter ? { retryAfter: res.retryAfter } : {}) },
    res.status ?? 400,
    res.status === 429 ? { "Retry-After": String(res.retryAfter ?? 15) } : {},
  );
}

export const idList = z
  .string()
  .max(2000)
  .transform((s) => s.split(",").filter(Boolean))
  .pipe(z.array(z.uuid()).max(50));

export { NextResponse };
