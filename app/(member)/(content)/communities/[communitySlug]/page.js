import Link from "next/link";
import { notFound } from "next/navigation";
import { MessagesSquare, Settings, UserPlus, Users } from "@/components/icons/lucide-compat";
import { CommunityNotifyMenu, ReportCommunityButton } from "@/components/community/header-actions";
import { MembersList } from "@/components/community/members-list";
import { MediaImage } from "@/components/media-image";
import { MyRecord } from "@/components/community/my-record";
import { JoinCommunityButton, OfficialBadge } from "@/components/campus/community-parts";
import { EmptyState } from "@/components/empty-state";
import { Composer } from "@/components/posts/composer";
import { ChatMarkdown } from "@/components/posts/chat-markdown";
import { PostCard } from "@/components/posts/post-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getAuthUser, getCurrentProfile } from "@/lib/auth/session";
import { getAiUiState } from "@/lib/ai/ui-state";
import { roleAtLeast } from "@/lib/community/rules";
import { getCommunityPosts } from "@/lib/services/campus";
import { getWorkspace, listMembers, listMyDecisions } from "@/lib/services/community-workspace";
import { isFlagEnabled } from "@/lib/settings";
import { isValidSlug } from "@/lib/slug";
import { excerpt } from "@/lib/text";
import { COMMUNITY_KINDS } from "@/lib/validators/campus";

export async function generateMetadata({ params }) {
  const { communitySlug } = await params;
  const user = await getAuthUser();
  const c = isValidSlug(communitySlug) && user ? (await getWorkspace(communitySlug, user.id))?.community : null;
  if (!c) return { title: "Community not found", robots: { index: false, follow: false } };
  return {
    title: c.name,
    description: excerpt(c.description || `${c.name} on UniSphere`, 160),
    alternates: { canonical: `/communities/${c.slug}` },
    robots: { index: false, follow: false }, // closed network: member content is never indexed or given a public preview
  };
}

export default async function CommunityPage({ params }) {
  if (!(await isFlagEnabled("communities"))) notFound();
  const { communitySlug } = await params;
  if (!isValidSlug(communitySlug)) notFound();
  const user = await getAuthUser();
  if (!user) notFound();
  const workspace = await getWorkspace(communitySlug, user.id);
  if (!workspace) notFound();
  const { community, me, prefs } = workspace;
  const profile = await getCurrentProfile();
  const isMember = community.my_status === "active";
  const staff = isMember && roleAtLeast(me?.role, "moderator");
  const communityMuted = prefs.some((p) => !p.channel_id && (p.level === "none" || (p.muted_until && new Date(p.muted_until) > new Date())));

  const [posts, members, ai, decisions] = await Promise.all([
    getCommunityPosts(community.id),
    listMembers(community.id, { status: "active", page: 0, pageSize: 30 }),
    profile && isMember ? getAiUiState(profile) : null,
    listMyDecisions(community.id, user.id),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header className="surface overflow-hidden">
        {/* The banner keeps the 3:1 shape but is capped in height, so a wide screen does not turn it into a poster. */}
        <div className="bg-muted relative aspect-[3/1] max-h-52 w-full sm:max-h-64">
          <MediaImage mediaKey={community.cover_key} width={1280} alt={`${community.name} banner`} className="size-full object-cover" fetchPriority="high" />
        </div>
        <div className="p-5 sm:p-6">
          {/* The icon overlaps the banner. The banner is a positioned box, so the icon must be one too (relative z-10) or the banner paints over it. */}
          <div className="relative z-10 -mt-12 mb-3 flex items-end gap-3 sm:-mt-14">
            <span className="bg-card border-card ring-border grid size-20 shrink-0 place-items-center overflow-hidden rounded-2xl border-4 text-xl font-bold shadow-sm ring-1 sm:size-24">
              {community.avatar_key ? (
                <MediaImage mediaKey={community.avatar_key} width={192} alt={`${community.name} icon`} className="size-full object-cover" />
              ) : (
                community.name.slice(0, 2).toUpperCase()
              )}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="mono">{COMMUNITY_KINDS.find((k) => k.value === community.kind)?.label}</Badge>
            {community.is_official && <OfficialBadge />}
            {community.visibility !== "public" && <Badge variant="mono">{community.visibility === "private" ? "Members only" : "College"}</Badge>}
          </div>
          <h1 className="mt-2 text-2xl font-extrabold sm:text-3xl">{community.name}</h1>
          {community.description && <p className="text-muted-foreground mt-2 whitespace-pre-wrap">{community.description}</p>}
          {community.topics?.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Topics">
              {community.topics.map((t) => <li key={t}><Link href={`/communities?topic=${t}`} className="hover:bg-accent rounded-full border px-2.5 py-0.5 text-xs">{t.replace(/-/g, " ")}</Link></li>)}
            </ul>
          )}
          <p className="text-muted-foreground mt-3 flex items-center gap-1.5 text-sm"><Users className="size-4" aria-hidden="true" />{community.member_count} member{community.member_count === 1 ? "" : "s"}</p>
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-4">
            {isMember && <Button asChild><Link href={`/communities/${community.slug}/channels`}><MessagesSquare /> Open channels</Link></Button>}
            <JoinCommunityButton community={community} viewerId={user.id} />
            {isMember && <Button asChild variant="outline" size="sm"><Link href={`/communities/${community.slug}/invite`}><UserPlus /> Invite</Link></Button>}
            {staff && <Button asChild variant="outline" size="sm"><Link href={`/communities/${community.slug}/settings`}><Settings /> {roleAtLeast(me.role, "admin") ? "Manage" : "Moderate"}</Link></Button>}
            {isMember && <CommunityNotifyMenu communityId={community.id} muted={communityMuted} />}
            <span className="ml-auto"><ReportCommunityButton communityId={community.id} /></span>
          </div>
        </div>
      </header>

      {community.rules && (
        <details className="surface p-4" open={community.require_rules_ack && isMember && !me?.rules_ack_at}>
          <summary className="cursor-pointer text-sm font-bold select-none">Community rules</summary>
          <div className="mt-2"><ChatMarkdown text={community.rules} /></div>
        </details>
      )}

      <MyRecord decisions={decisions} />

      <Tabs defaultValue="posts">
        <TabsList>
          <TabsTrigger value="posts">Posts</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
        </TabsList>
        <TabsContent value="posts" className="space-y-4 pt-4">
          {isMember && profile && <Composer profile={profile} ai={ai} community={{ id: community.id, visibility: community.visibility }} />}
          {posts.length === 0 ? (
            <EmptyState title="No posts yet">{isMember ? "Start the conversation for this community." : "Join the community to post here."}</EmptyState>
          ) : (
            <ul className="space-y-4">{posts.map((p) => <li key={p.id}><PostCard post={p} viewerId={user.id} /></li>)}</ul>
          )}
        </TabsContent>
        <TabsContent value="members" className="pt-4">
          <MembersList communityId={community.id} initial={{ members: members.members, hasMore: members.hasMore }} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
