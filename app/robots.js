import { publicEnv } from "@/lib/env-public";

// Only the pages that explain what UniSphere is may be crawled. Everything else is members-only.
const OPEN = ["/$", "/about", "/features", "/guidelines", "/contact", "/privacy", "/terms", "/cookies", "/privacy-centre", "/privacy-notice", "/grievance", "/privacy-contact", "/faq", "/accessibility", "/content-policy", "/copyright-policy", "/brand-policy", "/pricing", "/refund-policy", "/shipping-policy", "/llms.txt", "/sitemap.xml",
  // The Academy's explanatory pages. A certificate result (/academy/verify/<id>) is deliberately not listed.
  "/academy$", "/academy/courses", "/academy/programs", "/academy/internships", "/academy/mentorship", "/academy/pricing", "/academy/verify$"];

export default function robots() {
  return {
    rules: [{ userAgent: "*", allow: OPEN, disallow: "/" }],
    sitemap: `${publicEnv.appUrl}/sitemap.xml`,
  };
}
