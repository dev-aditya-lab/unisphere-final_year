import "server-only";
import { publicEnv } from "@/lib/env-public";

/**
 * CSRF defence for cookie-authenticated Route Handlers (Server Actions get this from Next.js).
 * State-changing requests must come from our own origin: the Origin header must match the
 * app's host (or, when absent, the Referer must).
 */
export function isSameOrigin(request) {
  const allowed = new Set([new URL(publicEnv.appUrl).host, request.headers.get("host")].filter(Boolean));
  const origin = request.headers.get("origin");
  try {
    if (origin) return allowed.has(new URL(origin).host);
    const referer = request.headers.get("referer");
    if (referer) return allowed.has(new URL(referer).host);
  } catch {
    return false;
  }
  return false;
}
