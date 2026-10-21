import { publicEnv } from "@/lib/env-public";

// Only the pages that explain what UniSphere is may be crawled. Everything else is members-only.
const OPEN = ["/$", "/about", "/features", "/guidelines", "/contact", "/privacy", "/terms", "/cookies", "/privacy-centre", "/privacy-notice", "/grievance", "/privacy-contact", "/faq", "/accessibility", "/content-policy", "/copyright-policy", "/brand-policy", "/pricing", "/refund-policy", "/shipping-policy", "/llms.txt", "/sitemap.xml"];

export default function robots() {
  return {
    rules: [{ userAgent: "*", allow: OPEN, disallow: "/" }],
    sitemap: `${publicEnv.appUrl}/sitemap.xml`,
  };
}
