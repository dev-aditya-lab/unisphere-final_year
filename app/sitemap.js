import { publicEnv } from "@/lib/env-public";
import { createAdminClient } from "@/lib/supabase/admin";
import { KINDS } from "@/lib/academy/constants";

/**
 * UniSphere is a closed network, so the sitemap lists only the pages a logged-out visitor can read: the home page and
 * the explanatory and legal pages. No member content, profile, project or event ever appears here.
 */
const PAGES = [
  ["/", 1, "monthly"], ["/about", 0.7, "monthly"], ["/features", 0.7, "monthly"], ["/guidelines", 0.5, "yearly"],
  ["/contact", 0.5, "yearly"], ["/privacy", 0.3, "yearly"], ["/terms", 0.3, "yearly"], ["/cookies", 0.3, "yearly"],
  ["/privacy-centre", 0.4, "yearly"], ["/privacy-notice", 0.4, "yearly"], ["/grievance", 0.4, "yearly"],
  ["/faq", 0.6, "monthly"], ["/content-policy", 0.4, "yearly"], ["/copyright-policy", 0.3, "yearly"], ["/brand-policy", 0.3, "yearly"], ["/accessibility", 0.4, "yearly"],
  ["/pricing", 0.5, "monthly"], ["/refund-policy", 0.3, "yearly"], ["/shipping-policy", 0.3, "yearly"],
  ["/academy", 0.9, "weekly"], ["/academy/courses", 0.8, "daily"], ["/academy/programs", 0.7, "weekly"], ["/academy/internships", 0.7, "weekly"],
  ["/academy/mentorship", 0.5, "monthly"], ["/academy/pricing", 0.6, "daily"], ["/academy/verify", 0.4, "yearly"],
];

export default async function sitemap() {
  const base = publicEnv.appUrl;
  const pages = PAGES.map(([path, priority, changeFrequency]) => ({ url: `${base}${path}`, changeFrequency, priority }));
  // Published Academy courses, programs and internships. Only public facts are read; a failure just leaves them out.
  try {
    const { data } = await createAdminClient().from("academy_courses").select("slug, kind, updated_at").eq("status", "published").order("published_at", { ascending: false }).limit(1000);
    for (const c of data ?? []) pages.push({ url: `${base}${KINDS[c.kind]?.path ?? "/academy/courses"}/${c.slug}`, lastModified: c.updated_at, changeFrequency: "weekly", priority: 0.7 });
  } catch {
    /* the sitemap still lists the static pages */
  }
  return pages;
}
