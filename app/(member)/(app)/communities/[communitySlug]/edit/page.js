import { notFound, redirect } from "next/navigation";
import { CommunityForm } from "@/components/campus/community-parts";
import { PageHeader } from "@/components/shell/page-header";
import { requireProfile } from "@/lib/auth/session";
import { getCommunityBySlug } from "@/lib/services/campus";
import { createClient } from "@/lib/supabase/server";
import { isValidSlug } from "@/lib/slug";

export const metadata = { title: "Edit community", robots: { index: false, follow: false } };

export default async function EditCommunityPage({ params }) {
  const { communitySlug } = await params;
  if (!isValidSlug(communitySlug)) notFound();
  await requireProfile();
  const card = await getCommunityBySlug(communitySlug);
  if (!card) notFound();
  if (!["owner", "admin"].includes(card.my_role)) redirect(`/communities/${communitySlug}`);
  const { data: community } = await (await createClient()).from("communities").select("*").eq("id", card.id).single();
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader eyebrow="Communities" title={`Edit ${community.name}`} />
      <CommunityForm community={community} />
    </div>
  );
}
