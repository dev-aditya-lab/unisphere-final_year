import { createAnonClient } from "@/lib/supabase/anon";
import { OG_SIZE, OG_TYPE, ogImage } from "@/lib/og";

export const alt = "A member on UniSphere";
export const size = OG_SIZE;
export const contentType = OG_TYPE;

export default async function Image({ params }) {
  const { username } = await params;
  const { data } = await createAnonClient()
    .from("profiles")
    .select("full_name, headline")
    .eq("username", String(username).toLowerCase()).eq("visibility", "public").eq("status", "active")
    .maybeSingle();
  if (!data) return ogImage({ label: "RGEC", title: "Your campus. Your people. Your next idea." });
  return ogImage({ label: "Member", title: data.full_name, byline: data.headline ?? undefined });
}
