import { publicEnv } from "@/lib/env-public";

// Only the pages that explain what UniSphere is may be crawled. Everything else is members-only.
const OPEN = ["/$", "/about", "/features", "/guidelines", "/contact", "/privacy", "/terms"];

export default function robots() {
  return {
    rules: [{ userAgent: "*", allow: OPEN, disallow: "/" }],
    sitemap: `${publicEnv.appUrl}/sitemap.xml`,
    host: publicEnv.appUrl,
  };
}
