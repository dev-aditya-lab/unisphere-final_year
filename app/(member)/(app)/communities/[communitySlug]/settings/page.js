import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AuditPanel } from "@/components/community/settings/audit-panel";
import { BrandingPanel } from "@/components/community/settings/branding-panel";
import { ChannelsManager } from "@/components/community/settings/channels-manager";
import { DangerZone } from "@/components/community/settings/danger-zone";
import { GeneralForm } from "@/components/community/settings/general-form";
import { InvitesPanel } from "@/components/community/settings/invites-panel";
import { MembersManager } from "@/components/community/settings/members-manager";
import { ModerationPanel } from "@/components/community/settings/moderation-panel";
import { getAiUiState } from "@/lib/ai/ui-state";
import { getCurrentProfile, requireProfile } from "@/lib/auth/session";
import { ROLE_LABEL, roleAtLeast } from "@/lib/community/rules";
import * as ws from "@/lib/services/community-workspace";
import { isFlagEnabled } from "@/lib/settings";
import { isValidSlug } from "@/lib/slug";
import { cn } from "@/lib/utils";

export const metadata = { title: "Manage community", robots: { index: false, follow: false } };

const TABS = [
  { id: "members", label: "Members", min: "moderator" },
  { id: "moderation", label: "Moderation", min: "moderator" },
  { id: "invites", label: "Invitations", min: "moderator" },
  { id: "channels", label: "Channels", min: "admin" },
  { id: "general", label: "General", min: "admin" },
  { id: "branding", label: "Icon & banner", min: "admin" },
  { id: "audit", label: "Audit log", min: "admin" },
];

/**
 * Community management. Moderators get members, moderation and invitations; administrators the rest; the owner can also delete the
 * community or hand it over. The tabs shown follow the member's role, and each tab loads only its own data under their own row level
 * security, so a tab they should not see cannot be made to return anything by editing the address.
 */
export default async function CommunitySettings({ params, searchParams }) {
  if (!(await isFlagEnabled("communities"))) notFound();
  const { communitySlug } = await params;
  if (!isValidSlug(communitySlug)) notFound();
  const { user } = await requireProfile();
  const workspace = await ws.getWorkspace(communitySlug, user.id);
  if (!workspace) notFound();
  const { community, me } = workspace;
  if (!me || me.status !== "active" || !roleAtLeast(me.role, "moderator")) redirect(`/communities/${communitySlug}`);

  const role = me.role;
  const tabs = TABS.filter((t) => roleAtLeast(role, t.min));
  const requested = (await searchParams)?.tab;
  const tab = tabs.find((t) => t.id === requested)?.id ?? tabs[0].id;
  const profile = await getCurrentProfile();
  const ai = profile ? await getAiUiState(profile) : null;

  let content;
  if (tab === "members") {
    content = <MembersManager community={{ id: community.id, slug: community.slug, name: community.name }} myRole={role} myId={user.id} pendingCount={await ws.countPending(community.id)} />;
  } else if (tab === "moderation") {
    const [reports, closed, appeals, actions] = await Promise.all([
      ws.listReports(community.id, { status: "open" }), ws.listReports(community.id, { status: "all" }), ws.listAppeals(community.id), ws.listModActions(community.id),
    ]);
    content = <ModerationPanel community={{ id: community.id }} myRole={role} reports={reports} appeals={appeals} actions={actions} closedReports={closed.filter((r) => ["dismissed", "action_taken"].includes(r.status)).slice(0, 15)} aiAvailable={Boolean(ai?.assist)} />;
  } else if (tab === "invites") {
    content = <InvitesPanel communityId={community.id} invites={await ws.listInvites(community.id)} canManage invitePolicy={community.invite_policy} />;
  } else if (tab === "channels") {
    content = <ChannelsManager communityId={community.id} categories={workspace.categories} channels={workspace.channels} />;
  } else if (tab === "general") {
    content = (
      <div className="space-y-8">
        <GeneralForm community={community} hasCollege={Boolean(profile?.college_id)} aiAvailable={Boolean(ai?.assist)} />
        {role === "owner" && <DangerZone community={{ id: community.id, slug: community.slug, name: community.name }} />}
      </div>
    );
  } else if (tab === "branding") {
    content = <BrandingPanel community={community} />;
  } else {
    content = <AuditPanel entries={await ws.listAudit(community.id)} />;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <header className="space-y-2">
        <Link href={`/communities/${communitySlug}/channels`} className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm"><ArrowLeft className="size-4" aria-hidden="true" /> Back to channels</Link>
        <h1 className="font-heading text-2xl font-extrabold">{community.name}</h1>
        <p className="text-muted-foreground text-sm">You are signed in here as {ROLE_LABEL[role].toLowerCase()}. What you can change depends on that role.</p>
      </header>
      <nav aria-label="Management sections" className="scrollbar-none -mx-1 flex gap-1 overflow-x-auto px-1">
        {tabs.map((t) => (
          <Link
            key={t.id}
            href={`/communities/${communitySlug}/settings?tab=${t.id}`}
            prefetch={false}
            aria-current={tab === t.id ? "page" : undefined}
            className={cn("focus-visible:ring-ring/45 shrink-0 rounded-lg px-3.5 py-2 text-sm font-medium outline-none focus-visible:ring-[3px]", tab === t.id ? "bg-primary-soft text-primary-text font-semibold" : "text-muted-foreground hover:bg-accent hover:text-foreground")}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      <section className="surface p-4 sm:p-6" aria-label={tabs.find((t) => t.id === tab)?.label}>
        {content}
      </section>
    </div>
  );
}
