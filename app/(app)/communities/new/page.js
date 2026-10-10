import { notFound } from "next/navigation";
import { CommunityForm } from "@/components/campus/community-parts";
import { PageHeader } from "@/components/shell/page-header";
import { requireProfile } from "@/lib/auth/session";
import { isFlagEnabled } from "@/lib/settings";

export const metadata = { title: "New community", robots: { index: false, follow: false } };

export default async function NewCommunityPage() {
  if (!(await isFlagEnabled("communities"))) notFound();
  await requireProfile();
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader eyebrow="Communities" title="Start a community" description="You become the owner and can appoint admins and moderators." />
      <CommunityForm />
    </div>
  );
}
