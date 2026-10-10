import { createAnonClient } from "@/lib/supabase/anon";
import { OG_SIZE, OG_TYPE, ogImage } from "@/lib/og";

export const alt = "A community on UniSphere";
export const size = OG_SIZE;
export const contentType = OG_TYPE;

export default async function Image({ params }) {
  const { communitySlug } = await params;
  const { data } = await createAnonClient()
    .from("communities")
    .select("name, description, member_count")
    .eq("slug", communitySlug).eq("visibility", "public").is("deleted_at", null)
    .maybeSingle();
  if (!data) return ogImage({ label: "RGEC", title: "Your campus. Your people. Your next idea." });
  return ogImage({ label: "Community", title: data.name, byline: `${data.member_count} member${data.member_count === 1 ? "" : "s"}${data.description ? ` · ${data.description}` : ""}` });
}
