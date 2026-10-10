import { createAnonClient } from "@/lib/supabase/anon";
import { publicEnv } from "@/lib/env-public";

export const revalidate = 3600;

const STATIC = [
  ["/", 1], ["/about", 0.7], ["/features", 0.7], ["/roadmap", 0.6], ["/changelog", 0.6],
  ["/guidelines", 0.5], ["/contact", 0.5], ["/privacy", 0.3], ["/terms", 0.3], ["/register", 0.6],
];
const LIMIT = 2000;

/**
 * Sitemap of everything an anonymous visitor may see. It uses a session-less client, so members-only and private
 * content can never appear here, whatever the visibility rules change to later.
 */
export default async function sitemap() {
  const base = publicEnv.appUrl;
  const db = createAnonClient();
  const [posts, projects, events, communities, profiles] = await Promise.all([
    db.from("posts").select("slug, category, updated_at").eq("visibility", "public").eq("status", "published").is("repost_of_id", null).order("updated_at", { ascending: false }).limit(LIMIT),
    db.from("projects").select("slug, updated_at").eq("visibility", "public").is("deleted_at", null).order("updated_at", { ascending: false }).limit(LIMIT),
    db.from("events").select("slug, updated_at").eq("visibility", "public").eq("status", "published").is("deleted_at", null).order("updated_at", { ascending: false }).limit(LIMIT),
    db.from("communities").select("slug, updated_at").eq("visibility", "public").is("deleted_at", null).order("updated_at", { ascending: false }).limit(LIMIT),
    db.from("profiles").select("username, updated_at").eq("visibility", "public").eq("status", "active").not("onboarded_at", "is", null).order("updated_at", { ascending: false }).limit(LIMIT),
  ]);
  const entry = (path, lastModified, priority = 0.5, changeFrequency = "weekly") => ({ url: `${base}${path}`, lastModified: lastModified ? new Date(lastModified) : undefined, changeFrequency, priority });
  return [
    ...STATIC.map(([path, priority]) => entry(path, undefined, priority, path === "/" ? "daily" : "monthly")),
    ...(posts.data ?? []).map((p) => entry(`/${p.category === "ideas" ? "ideas" : "posts"}/${p.slug}`, p.updated_at, 0.6)),
    ...(projects.data ?? []).map((p) => entry(`/projects/${p.slug}`, p.updated_at, 0.6)),
    ...(events.data ?? []).map((p) => entry(`/events/${p.slug}`, p.updated_at, 0.5)),
    ...(communities.data ?? []).map((p) => entry(`/communities/${p.slug}`, p.updated_at, 0.5)),
    ...(profiles.data ?? []).map((p) => entry(`/u/${p.username}`, p.updated_at, 0.4)),
  ];
}
