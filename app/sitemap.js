import { publicEnv } from "@/lib/env-public";

/**
 * UniSphere is a closed network, so the sitemap lists only the pages a logged-out visitor can read: the home page and
 * the explanatory and legal pages. No member content, profile, project or event ever appears here.
 */
const PAGES = [
  ["/", 1, "monthly"], ["/about", 0.7, "monthly"], ["/features", 0.7, "monthly"], ["/guidelines", 0.5, "yearly"],
  ["/contact", 0.5, "yearly"], ["/privacy", 0.3, "yearly"], ["/terms", 0.3, "yearly"], ["/cookies", 0.3, "yearly"],
  ["/faq", 0.6, "monthly"], ["/content-policy", 0.4, "yearly"], ["/copyright-policy", 0.3, "yearly"], ["/brand-policy", 0.3, "yearly"], ["/accessibility", 0.4, "yearly"],
  ["/pricing", 0.5, "monthly"], ["/refund-policy", 0.3, "yearly"], ["/shipping-policy", 0.3, "yearly"],
];

export default function sitemap() {
  const base = publicEnv.appUrl;
  return PAGES.map(([path, priority, changeFrequency]) => ({ url: `${base}${path}`, changeFrequency, priority }));
}
