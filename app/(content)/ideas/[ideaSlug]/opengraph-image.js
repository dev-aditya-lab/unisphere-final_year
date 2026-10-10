import { createAnonClient } from "@/lib/supabase/anon";
import { OG_SIZE, OG_TYPE, ogImage } from "@/lib/og";

export const alt = "An idea on UniSphere";
export const size = OG_SIZE;
export const contentType = OG_TYPE;

export default async function Image({ params }) {
  const { ideaSlug } = await params;
  const { data } = await createAnonClient()
    .from("posts")
    .select("title, body, author:profiles!posts_author_id_fkey(full_name)")
    .eq("slug", ideaSlug).eq("category", "ideas").eq("visibility", "public").eq("status", "published")
    .maybeSingle();
  if (!data) return ogImage({ label: "RGEC", title: "Your campus. Your people. Your next idea." });
  return ogImage({ label: "Idea", title: data.title || data.body, byline: data.author?.full_name ? `by ${data.author.full_name}` : undefined });
}
