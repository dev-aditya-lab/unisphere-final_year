import { CoverArt } from "@/components/profile/cover-art";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BadgeCheck, Building2, ExternalLink, GraduationCap, Handshake, Link2, Trophy, Briefcase, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConnectControls } from "@/components/people/connect-button";
import { PostCard } from "@/components/posts/post-card";
import { EmptyState } from "@/components/empty-state";
import { BlueTick } from "@/components/ui/blue-tick";
import { UserAvatar } from "@/components/user-avatar";
import { getAuthUser } from "@/lib/auth/session";
import { getProfilePage, resolveRenamedUsername } from "@/lib/services/profiles";
import { getPostsByAuthor } from "@/lib/services/posts";
import { getRelationship } from "@/lib/services/social";
import { createClient } from "@/lib/supabase/server";
import { isFlagEnabled } from "@/lib/settings";
import { formatDate } from "@/lib/format";
import { mediaUrl } from "@/lib/media";
import { publicEnv } from "@/lib/env-public";
import { excerpt } from "@/lib/text";
import { USERNAME_REGEX } from "@/lib/constants";

const TYPE_LABEL = { student: "Student", alumni: "Alumni", faculty: "Faculty", staff: "Staff" };

function validUsername(u) {
  return typeof u === "string" && USERNAME_REGEX.test(u);
}

export async function generateMetadata({ params }) {
  const { username } = await params;
  if (!validUsername(username)) return { title: "Profile not found", robots: { index: false, follow: false } };
  const data = await getProfilePage(username);
  if (!data) return { title: "Profile not found", robots: { index: false, follow: false } };
  const { profile } = data;
  const title = `${profile.full_name} (@${profile.username})`;
  const description = excerpt(profile.bio || profile.headline || `${profile.full_name} on UniSphere`, 160);
  const isPublic = false; // closed network: member content is never indexed or given a public preview
  return {
    title,
    description,
    alternates: { canonical: `/u/${profile.username}` },
    robots: isPublic ? { index: true, follow: true } : { index: false, follow: false },
    openGraph: isPublic ? { type: "profile", title, description, url: `/u/${profile.username}` } : undefined,
    twitter: isPublic ? { card: "summary", title, description } : undefined,
  };
}

export default async function ProfilePage({ params, searchParams }) {
  const { username } = await params;
  if (!validUsername(username)) notFound();
  const sp = await searchParams;

  const data = await getProfilePage(username);
  if (!data) {
    const current = await resolveRenamedUsername(username);
    if (current) redirect(`/u/${current}`);
    notFound();
  }

  const { profile, college, department, program, classInfo, achievements, experiences } = data;
  const user = await getAuthUser();
  const viewerId = user?.id ?? null;
  const isSelf = viewerId === profile.id;

  const cursor = sp.ts && sp.id ? { ts: String(sp.ts), id: String(sp.id) } : null;
  const [relationship, postsPage] = await Promise.all([getRelationship(viewerId, profile.id), getPostsByAuthor(profile.id, { cursor })]);
  let canMessage = false;
  if (viewerId && !isSelf && (await isFlagEnabled("messaging"))) {
    const { data } = await (await createClient()).rpc("can_message", { p_sender: viewerId, p_recipient: profile.id });
    canMessage = Boolean(data);
  }

  const cover = mediaUrl(profile.cover_key);
  const links = [
    profile.github_url && { label: "GitHub", href: profile.github_url },
    profile.portfolio_url && { label: "Portfolio", href: profile.portfolio_url },
    profile.social_links?.linkedin && { label: "LinkedIn", href: profile.social_links.linkedin },
    profile.social_links?.twitter && { label: "X / Twitter", href: profile.social_links.twitter },
  ].filter(Boolean);

  const jsonLd =
    profile.visibility === "public"
      ? {
          "@context": "https://schema.org",
          "@type": "ProfilePage",
          mainEntity: {
            "@type": "Person",
            name: profile.full_name,
            alternateName: profile.username,
            description: profile.bio || profile.headline || undefined,
            url: `${publicEnv.appUrl}/u/${profile.username}`,
            sameAs: links.map((l) => l.href),
            knowsAbout: profile.skills,
          },
        }
      : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">

      <section className="surface overflow-hidden" aria-labelledby="profile-name">
        <div className="bg-muted relative aspect-[4/1] w-full">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover} alt="" className="size-full object-cover" />
          ) : (
            <CoverArt seed={profile.username} className="size-full" />
          )}
        </div>
        <div className="px-5 pb-5 sm:px-6">
          <div className="-mt-10 flex flex-wrap items-end justify-between gap-3">
            <UserAvatar name={profile.full_name} avatarKey={profile.avatar_key} size="xl" className="ring-card ring-4" />
            <ConnectControls
              targetId={profile.id}
              targetName={profile.full_name}
              relationship={relationship}
              viewerId={viewerId}
              loginNext={`/u/${profile.username}`}
              canMessage={canMessage}
            />
          </div>

          <div className="mt-3">
            <h1 id="profile-name" className="flex items-center gap-2 text-2xl font-extrabold">
              {profile.full_name}
              {profile.blue_tick && <BlueTick className="size-5" />}
              {profile.verification_status === "verified" && <BadgeCheck className="text-teal-text size-5" aria-label="Verified member" />}
            </h1>
            <p className="text-muted-foreground text-sm">
              @{profile.username}{profile.account_type ? <> · <span title="Self-described, not verified">{TYPE_LABEL[profile.account_type]}</span></> : null}
            </p>
            {profile.headline && <p className="mt-2 text-[15px]">{profile.headline}</p>}
          </div>

          <ul className="text-muted-foreground mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
            {college && (
              <li className="flex items-center gap-1.5">
                <Building2 className="size-4" aria-hidden="true" />
                {college.slug ? (
                  <Link prefetch={false} href={`/colleges/${college.slug}`} className="hover:text-foreground underline-offset-2 hover:underline">
                    {college.name}
                  </Link>
                ) : (
                  college.name
                )}
              </li>
            )}
            {(program || department) && (
              <li className="flex items-center gap-1.5">
                <GraduationCap className="size-4" aria-hidden="true" />
                {program?.name ?? department?.name}
                {profile.graduation_year ? ` · Class of ${profile.graduation_year}` : ""}
              </li>
            )}
            {classInfo && (classInfo.current_year || classInfo.current_semester) && (
              <li>
                {classInfo.current_year ? `Year ${classInfo.current_year}` : ""}
                {classInfo.current_year && classInfo.current_semester ? " · " : ""}
                {classInfo.current_semester ? `Semester ${classInfo.current_semester}` : ""}
              </li>
            )}
          </ul>

          <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
            <span className="flex items-center gap-1.5">
              <Link2 className="text-muted-foreground size-4" aria-hidden="true" />
              <strong>{profile.connection_count}</strong> connections
            </span>
            <span className="flex items-center gap-1.5">
              <Users className="text-muted-foreground size-4" aria-hidden="true" />
              <strong>{profile.follower_count}</strong> followers
            </span>
          </p>

          {profile.bio && <p className="mt-4 text-[15px] leading-relaxed whitespace-pre-wrap">{profile.bio}</p>}

          {(profile.open_to_collaboration || profile.open_to_mentoring) && (
            <div className="mt-4 flex flex-wrap gap-2">
              {profile.open_to_collaboration && (
                <Badge variant="success">
                  <Handshake /> Open to collaboration
                </Badge>
              )}
              {profile.open_to_mentoring && (
                <Badge variant="soft">
                  <GraduationCap /> Open to mentoring
                </Badge>
              )}
            </div>
          )}

          {links.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-2" aria-label="Links">
              {links.map((l) => (
                <li key={l.label}>
                  <Button asChild variant="outline" size="sm">
                    <a href={l.href} target="_blank" rel="noopener noreferrer nofollow ugc">
                      {l.label} <ExternalLink />
                    </a>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {(profile.skills.length > 0 || profile.interests.length > 0 || profile.preferred_roles.length > 0) && (
        <section className="surface space-y-4 p-5" aria-labelledby="skills-title">
          <h2 id="skills-title" className="eyebrow">
            Skills &amp; interests
          </h2>
          {profile.skills.length > 0 && (
            <ul className="flex flex-wrap gap-1.5" aria-label="Skills">
              {profile.skills.map((s) => (
                <li key={s}>
                  <Link href={`/search?type=people&skill=${encodeURIComponent(s)}`}>
                    <Badge variant="soft" className="py-1 text-[13px]">
                      {s}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {profile.interests.length > 0 && (
            <ul className="flex flex-wrap gap-1.5" aria-label="Interests">
              {profile.interests.map((s) => (
                <li key={s}>
                  <Badge variant="mono" className="normal-case tracking-normal">
                    {s}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
          {profile.preferred_roles.length > 0 && <p className="text-muted-foreground text-sm">Enjoys: {profile.preferred_roles.join(", ")}</p>}
        </section>
      )}

      {experiences.length > 0 && (
        <section className="surface p-5" aria-labelledby="exp-title">
          <h2 id="exp-title" className="eyebrow mb-3 flex items-center gap-2">
            <Briefcase className="size-3.5" aria-hidden="true" /> Experience
          </h2>
          <ul className="divide-y">
            {experiences.map((x) => (
              <li key={x.id} className="py-3 first:pt-0 last:pb-0">
                <p className="text-sm font-semibold">
                  {x.title} <span className="text-muted-foreground font-normal">· {x.organization}</span>
                </p>
                {(x.start_date || x.end_date) && (
                  <p className="text-muted-foreground text-xs">
                    {x.start_date ? formatDate(x.start_date, { month: "short", year: "numeric", timeZone: "UTC" }) : "—"} –{" "}
                    {x.end_date ? formatDate(x.end_date, { month: "short", year: "numeric", timeZone: "UTC" }) : "Present"}
                  </p>
                )}
                {x.description && <p className="text-muted-foreground mt-1 text-sm">{x.description}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {achievements.length > 0 && (
        <section className="surface p-5" aria-labelledby="ach-title">
          <h2 id="ach-title" className="eyebrow mb-3 flex items-center gap-2">
            <Trophy className="size-3.5" aria-hidden="true" /> Achievements
          </h2>
          <ul className="divide-y">
            {achievements.map((a) => (
              <li key={a.id} className="py-3 first:pt-0 last:pb-0">
                <p className="text-sm font-semibold">
                  {a.url ? (
                    <a href={a.url} target="_blank" rel="noopener noreferrer nofollow ugc" className="hover:underline">
                      {a.title}
                    </a>
                  ) : (
                    a.title
                  )}
                </p>
                {a.achieved_on && <p className="text-muted-foreground text-xs">{formatDate(a.achieved_on, { month: "short", year: "numeric", timeZone: "UTC" })}</p>}
                {a.description && <p className="text-muted-foreground mt-1 text-sm">{a.description}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="posts-title">
        <h2 id="posts-title" className="font-heading mb-3 text-lg font-bold">
          Posts
        </h2>
        {postsPage.items.length === 0 ? (
          <EmptyState title={isSelf ? "You have not posted yet" : "No public posts yet"}>
            {isSelf ? "Share a project, idea or question from your feed." : "Posts you are allowed to see will appear here."}
          </EmptyState>
        ) : (
          <>
            <ul className="space-y-4">
              {postsPage.items.map((p) => (
                <li key={p.id}>
                  <PostCard post={p} viewerId={viewerId} />
                </li>
              ))}
            </ul>
            {postsPage.nextCursor && (
              <div className="mt-5 text-center">
                <Button asChild variant="outline">
                  <Link prefetch={false} href={`/u/${profile.username}?ts=${encodeURIComponent(postsPage.nextCursor.ts)}&id=${postsPage.nextCursor.id}`}>Older posts</Link>
                </Button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
