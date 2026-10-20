import Link from "next/link";
import { notFound } from "next/navigation";
import { Users } from "lucide-react";
import { CommunityAdminPanel, JoinCommunityButton, OfficialBadge } from "@/components/campus/community-parts";
import { EmptyState } from "@/components/empty-state";
import { Composer } from "@/components/posts/composer";
import { PostCard } from "@/components/posts/post-card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserAvatar } from "@/components/user-avatar";
import { getAuthUser, getCurrentProfile, hasPermission } from "@/lib/auth/session";
import { getAiUiState } from "@/lib/ai/ui-state";
import { getCommunityBySlug, getCommunityMembers, getCommunityPosts } from "@/lib/services/campus";
import { isFlagEnabled } from "@/lib/settings";
import { isValidSlug } from "@/lib/slug";
import { excerpt } from "@/lib/text";
import { COMMUNITY_KINDS } from "@/lib/validators/campus";

export async function generateMetadata({ params }) {
  const { communitySlug } = await params;
  const c = isValidSlug(communitySlug) ? await getCommunityBySlug(communitySlug) : null;
  if (!c) return { title: "Community not found", robots: { index: false, follow: false } };
  const isPublic = false; // closed network: member content is never indexed or given a public preview
  return {
    title: c.name,
    description: excerpt(c.description || `${c.name} on UniSphere`, 160),
    alternates: { canonical: `/communities/${c.slug}` },
    robots: isPublic ? { index: true, follow: true } : { index: false, follow: false },
  };
}

export default async function CommunityPage({ params }) {
  if (!(await isFlagEnabled("communities"))) notFound();
  const { communitySlug } = await params;
  if (!isValidSlug(communitySlug)) notFound();
  const community = await getCommunityBySlug(communitySlug);
  if (!community) notFound();

  const user = await getAuthUser();
  const profile = user ? await getCurrentProfile() : null;
  const isMember = community.my_status === "active";
  const isAdmin = ["owner", "admin"].includes(community.my_role);
  const canModerate = isAdmin || community.my_role === "moderator";
  const [posts, members, ai, canOfficial] = await Promise.all([
    getCommunityPosts(community.id),
    getCommunityMembers(community.id, { includePending: canModerate }),
    profile && isMember ? getAiUiState(profile) : null,
    user ? hasPermission("communities.manage", community.college_id) : false,
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header className="surface p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="mono">{COMMUNITY_KINDS.find((k) => k.value === community.kind)?.label}</Badge>
          {community.is_official && <OfficialBadge />}
          {community.visibility !== "public" && <Badge variant="mono">{community.visibility === "private" ? "Members only" : "College"}</Badge>}
        </div>
        <h1 className="mt-2 text-2xl font-extrabold sm:text-3xl">{community.name}</h1>
        {community.description && <p className="text-muted-foreground mt-2 whitespace-pre-wrap">{community.description}</p>}
        <p className="text-muted-foreground mt-3 flex items-center gap-1.5 text-sm"><Users className="size-4" aria-hidden="true" />{community.member_count} member{community.member_count === 1 ? "" : "s"}</p>
        <div className="mt-4 border-t pt-4"><JoinCommunityButton community={community} viewerId={user?.id ?? null} /></div>
      </header>

      <Tabs defaultValue="posts">
        <TabsList>
          <TabsTrigger value="posts">Posts</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
          {canModerate && <TabsTrigger value="manage">Manage{members.some((m) => m.status === "pending") ? " •" : ""}</TabsTrigger>}
        </TabsList>
        <TabsContent value="posts" className="space-y-4 pt-4">
          {isMember && profile && <Composer profile={profile} ai={ai} community={{ id: community.id, visibility: community.visibility }} />}
          {posts.length === 0 ? (
            <EmptyState title="No posts yet">{isMember ? "Start the conversation for this community." : "Join the community to post here."}</EmptyState>
          ) : (
            <ul className="space-y-4">{posts.map((p) => <li key={p.id}><PostCard post={p} viewerId={user?.id ?? null} /></li>)}</ul>
          )}
        </TabsContent>
        <TabsContent value="members" className="pt-4">
          <ul className="surface grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
            {members.filter((m) => m.status === "active").map((m) => (
              <li key={m.user_id} className="flex items-center gap-2.5">
                <UserAvatar name={m.person.full_name} avatarKey={m.person.avatar_key} size="sm" />
                <div className="min-w-0 leading-tight">
                  {m.person.username ? <Link href={`/u/${m.person.username}`} className="truncate text-sm font-semibold hover:underline">{m.person.full_name}</Link> : <span className="text-sm font-semibold">{m.person.full_name}</span>}
                  {m.role !== "member" && <p className="text-muted-foreground text-xs capitalize">{m.role}</p>}
                </div>
              </li>
            ))}
          </ul>
        </TabsContent>
        {canModerate && (
          <TabsContent value="manage" className="surface mt-4 p-5">
            <CommunityAdminPanel community={community} members={members} isOwner={community.my_role === "owner"} canMakeOfficial={canOfficial} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
