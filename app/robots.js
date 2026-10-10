import { publicEnv } from "@/lib/env-public";

// Public pages are crawlable. Everything behind a login, every API route and the admin console are not.
const PRIVATE = ["/api/", "/admin", "/settings", "/messages", "/notifications", "/bookmarks", "/connections", "/onboarding", "/auth/", "/suspended", "/forbidden", "/feedback", "/search", "/_next/"];

export default function robots() {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: PRIVATE }],
    sitemap: `${publicEnv.appUrl}/sitemap.xml`,
    host: publicEnv.appUrl,
  };
}
