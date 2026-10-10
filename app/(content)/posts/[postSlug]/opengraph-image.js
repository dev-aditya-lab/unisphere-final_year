import { createAnonClient } from "@/lib/supabase/anon";
import { OG_SIZE, OG_TYPE, ogImage } from "@/lib/og";
import { CATEGORY_BY_VALUE } from "@/lib/content/post-meta";

export const alt = "A post on UniSphere";
export const size = OG_SIZE;
export const contentType = OG_TYPE;

export default async function Image({ params }) {
  const { postSlug } = await params;
  const { data } = await createAnonClient()
    .from("posts")
    .select("title, body, category, author:profiles!posts_author_id_fkey(full_name)")
    .eq("slug", postSlug).eq("visibility", "public").eq("status", "published")
    .maybeSingle();
  if (!data) return ogImage({ label: "RGEC", title: "Your campus. Your people. Your next idea." });
  return ogImage({
    label: CATEGORY_BY_VALUE[data.category]?.label ?? "Post",
    title: data.title || data.body,
    byline: data.author?.full_name ? `by ${data.author.full_name}` : undefined,
  });
}
