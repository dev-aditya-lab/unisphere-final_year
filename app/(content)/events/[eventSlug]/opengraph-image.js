import { createAnonClient } from "@/lib/supabase/anon";
import { OG_SIZE, OG_TYPE, ogImage } from "@/lib/og";
import { formatEventRange } from "@/lib/time";

export const alt = "An event on UniSphere";
export const size = OG_SIZE;
export const contentType = OG_TYPE;

export default async function Image({ params }) {
  const { eventSlug } = await params;
  const { data } = await createAnonClient()
    .from("events")
    .select("title, starts_at, ends_at, timezone, location")
    .eq("slug", eventSlug).eq("visibility", "public").eq("status", "published").is("deleted_at", null)
    .maybeSingle();
  if (!data) return ogImage({ label: "RGEC", title: "Your campus. Your people. Your next idea." });
  return ogImage({ label: "Event", title: data.title, byline: [formatEventRange(data.starts_at, data.ends_at, data.timezone), data.location].filter(Boolean).join(" · ") });
}
