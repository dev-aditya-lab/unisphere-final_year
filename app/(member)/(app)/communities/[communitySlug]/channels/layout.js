import { notFound, redirect } from "next/navigation";
import { WorkspaceFrame } from "@/components/community/workspace-frame";
import { WorkspaceProvider } from "@/components/community/workspace-provider";
import { requireProfile } from "@/lib/auth/session";
import { getWorkspace } from "@/lib/services/community-workspace";
import { isFlagEnabled } from "@/lib/settings";
import { isValidSlug } from "@/lib/slug";

export const metadata = { robots: { index: false, follow: false } };

/**
 * The community workspace: channel list on the left, a channel on the right. The list is read once here, under the member's own
 * row level security, so a channel they cannot read is not in the page at all. A member who has not joined is sent to the
 * community page; a community they cannot see does not exist for them.
 */
export default async function WorkspaceLayout({ children, params }) {
  if (!(await isFlagEnabled("communities"))) notFound();
  const { communitySlug } = await params;
  if (!isValidSlug(communitySlug)) notFound();
  const { user } = await requireProfile();
  const workspace = await getWorkspace(communitySlug, user.id);
  if (!workspace) notFound();
  if (!workspace.me || workspace.me.status !== "active") redirect(`/communities/${communitySlug}`);
  const { community, ...data } = workspace;
  return (
    <WorkspaceProvider community={community} viewerId={user.id} data={data}>
      <WorkspaceFrame slug={communitySlug}>{children}</WorkspaceFrame>
    </WorkspaceProvider>
  );
}
