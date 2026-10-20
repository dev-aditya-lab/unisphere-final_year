import { NextResponse } from "next/server";

/**
 * A redirect to a path on this site, with a relative `Location` header.
 *
 * Route Handlers must not build a redirect from `new URL(request.url).origin`. Behind a reverse proxy (Render, Vercel,
 * Caddy, Nginx) the origin Next.js reports is the server's own address and port, so a visitor who clicked a link on
 * https://example.com was sent to https://localhost:10000/... Browsers resolve a relative `Location` against the address
 * they actually used, so this is correct behind any proxy and does not depend on an environment variable.
 *
 * `path` must already be a safe same-site path (pass user-supplied targets through `safeNext` first).
 */
export function redirectToPath(path, status = 307) {
  if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//")) {
    throw new Error("redirectToPath expects a path that starts with a single '/'");
  }
  return new NextResponse(null, { status, headers: { Location: path } });
}
