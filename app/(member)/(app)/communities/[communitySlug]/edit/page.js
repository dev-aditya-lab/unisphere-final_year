import { notFound, redirect } from "next/navigation";
import { isValidSlug } from "@/lib/slug";

// Editing moved into the community's management page (audited, permission-checked). Old links and bookmarks still arrive here.
export default async function EditCommunityPage({ params }) {
  const { communitySlug } = await params;
  if (!isValidSlug(communitySlug)) notFound();
  redirect(`/communities/${communitySlug}/settings?tab=general`);
}
