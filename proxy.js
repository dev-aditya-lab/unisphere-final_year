import { NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";
import { isGuestOnlyPath, isProtectedPath } from "@/lib/routes";
import { buildCsp, newNonce } from "@/lib/security/csp";

/**
 * Edge of the app: keeps the Supabase session fresh, redirects anonymous visitors away
 * from protected areas, and honours maintenance mode. This is a convenience and
 * performance layer. Authorization is re-checked in every page, action and RLS policy.
 */

// Maintenance flag, cached briefly per server instance (it is a public setting).
let maintenanceCache = { value: false, at: 0 };

async function isMaintenanceMode() {
  const now = Date.now();
  if (now - maintenanceCache.at < 10_000) return maintenanceCache.value;
  try {
    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/system_settings?select=value&key=eq.maintenance_mode&limit=1`;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const res = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store" });
    if (res.ok) {
      const rows = await res.json();
      maintenanceCache = { value: rows?.[0]?.value === true, at: now };
    } else {
      maintenanceCache = { value: false, at: now };
    }
  } catch {
    maintenanceCache = { value: false, at: now };
  }
  return maintenanceCache.value;
}

const MAINTENANCE_ALLOWED = ["/maintenance", "/login", "/auth", "/api/cron", "/api/health", "/forgot-password", "/reset-password"];

export async function proxy(request) {
  const { pathname, search } = request.nextUrl;
  // A fresh nonce per request. Next.js reads it from the request's CSP header and tags its own scripts with it.
  const nonce = newNonce();
  const csp = buildCsp({ nonce, isDev: process.env.NODE_ENV === "development" });
  const secure = (res) => {
    res.headers.set("Content-Security-Policy", csp);
    return res;
  };
  const { getResponse, claims, supabase } = await updateSession(request, {
    "x-pathname": pathname + search,
    "x-nonce": nonce,
    "Content-Security-Policy": csp,
  });
  const signedIn = Boolean(claims?.sub);

  if (await isMaintenanceMode()) {
    const allowed = MAINTENANCE_ALLOWED.some((p) => pathname === p || pathname.startsWith(`${p}/`));
    if (!allowed) {
      let staff = false;
      if (signedIn) {
        const { data } = await supabase.rpc("my_permissions");
        staff = Array.isArray(data) && data.length > 0;
      }
      if (!staff) {
        if (pathname.startsWith("/api/")) {
          return secure(NextResponse.json({ error: "maintenance" }, { status: 503, headers: { "Retry-After": "300" } }));
        }
        const url = request.nextUrl.clone();
        url.pathname = "/maintenance";
        url.search = "";
        return secure(NextResponse.rewrite(url, { status: 503, headers: { "Retry-After": "300" } }));
      }
    }
  }

  if (!pathname.startsWith("/api/")) {
    if (!signedIn && isProtectedPath(pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.search = `?next=${encodeURIComponent(pathname + search)}`;
      return secure(NextResponse.redirect(url));
    }
    if (signedIn && isGuestOnlyPath(pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = "/feed";
      url.search = "";
      return secure(NextResponse.redirect(url));
    }
  }

  return secure(getResponse());
}

export const config = {
  matcher: [
    // Everything except static assets and image optimisation.
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon|opengraph-image|twitter-image|sitemap.xml|robots.txt|llms.txt|humans.txt|sw.js|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)",
  ],
};
