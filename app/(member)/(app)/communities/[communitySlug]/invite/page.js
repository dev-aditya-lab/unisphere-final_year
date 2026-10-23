import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { InvitesPanel } from "@/components/community/settings/invites-panel";
import { requireProfile } from "@/lib/auth/session";
import { roleAtLeast } from "@/lib/community/rules";
import * as ws from "@/lib/services/community-workspace";
import { isFlagEnabled } from "@/lib/settings";
import { isValidSlug } from "@/lib/slug";

export const metadata = { title: "Invite people", robots: { index: false, follow: false } };

/**
 * Invite friends and classmates. Staff can always create invitations; other members only when the community allows it
 * ("Who can create invite links"), with a shorter life and a use limit. The database enforces both; this page only chooses what to show.
 */
export default async function InvitePage({ params }) {
  if (!(await isFlagEnabled("communities"))) notFound();
  const { communitySlug } = await params;
  if (!isValidSlug(communitySlug)) notFound();
  const { user } = await requireProfile();
  const workspace = await ws.getWorkspace(communitySlug, user.id);
  if (!workspace) notFound();
  const { community, me } = workspace;
  if (!me || me.status !== "active") redirect(`/communities/${communitySlug}`);
  const staff = roleAtLeast(me.role, "moderator");
  const allowed = staff || community.invite_policy === "members";
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Link href={`/communities/${communitySlug}/channels`} className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm"><ArrowLeft className="size-4" aria-hidden="true" /> Back to channels</Link>
      <h1 className="font-heading text-2xl font-extrabold">Invite people to {community.name}</h1>
      <section className="surface p-4 sm:p-6">
        {allowed ? (
          <InvitesPanel communityId={community.id} invites={await ws.listInvites(community.id)} canManage={staff} invitePolicy={community.invite_policy} />
        ) : (
          <div className="space-y-2">
            <p className="text-sm">Only moderators and administrators can create invitations for this community.</p>
            <p className="text-muted-foreground text-sm">
              {community.visibility === "private" ? "This community is hidden from discovery, so ask a moderator for an invitation link." : "You can still share the community page: copy its address from your browser."}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
