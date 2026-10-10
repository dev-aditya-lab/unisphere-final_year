import { createAnonClient } from "@/lib/supabase/anon";
import { OG_SIZE, OG_TYPE, ogImage } from "@/lib/og";

export const alt = "A project on UniSphere";
export const size = OG_SIZE;
export const contentType = OG_TYPE;

export default async function Image({ params }) {
  const { projectSlug } = await params;
  const { data } = await createAnonClient()
    .from("projects")
    .select("name, tagline, owner:profiles!projects_owner_id_fkey(full_name)")
    .eq("slug", projectSlug).eq("visibility", "public").is("deleted_at", null)
    .maybeSingle();
  if (!data) return ogImage({ label: "RGEC", title: "Your campus. Your people. Your next idea." });
  return ogImage({ label: "Project", title: data.name, byline: [data.tagline, data.owner?.full_name && `by ${data.owner.full_name}`].filter(Boolean).join(" · ") });
}
