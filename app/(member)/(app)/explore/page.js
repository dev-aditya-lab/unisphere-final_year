import Link from "next/link";
import { Hash } from "lucide-react";
import { Handshake } from "@/components/icons/lucide-compat";
import { Sparkles } from "@/components/icons/lucide-compat";
import { EmptyState } from "@/components/empty-state";
import { PersonCard } from "@/components/people/person-card";
import { QuickConnect } from "@/components/people/quick-connect";
import { PostCard } from "@/components/posts/post-card";
import { PageHeader } from "@/components/shell/page-header";
import { requireProfile } from "@/lib/auth/session";
import { getFeedPage, getPostsByHashtag, getTrendingHashtags } from "@/lib/services/posts";
import { searchPeople } from "@/lib/services/social";

export const metadata = { title: "Explore", robots: { index: false, follow: false } };

export default async function ExplorePage({ searchParams }) {
  const { user, profile } = await requireProfile();
  const sp = await searchParams;
  const tag = typeof sp.tag === "string" && /^[a-z0-9_]{2,40}$/i.test(sp.tag) ? sp.tag.toLowerCase() : null;

  if (tag) {
    const posts = await getPostsByHashtag(tag);
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader eyebrow="Hashtag" title={`#${tag}`} description="Posts you are allowed to see that use this tag." actions={<Link href="/explore" className="text-blue-text text-sm font-semibold hover:underline">All of Explore</Link>} />
        {posts.length === 0 ? (
          <EmptyState icon={Hash} title="Nothing here yet">
            No visible posts use #{tag}. Be the first to start the conversation.
          </EmptyState>
        ) : (
          <ul className="space-y-4">
            {posts.map((p) => (
              <li key={p.id}>
                <PostCard post={p} viewerId={user.id} />
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  const [tags, collaborators, recent] = await Promise.all([
    getTrendingHashtags(12),
    searchPeople({ collegeId: profile.college_id, openToCollab: true, limit: 4 }),
    getFeedPage({ scope: "public", limit: 6 }),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-10">
      <PageHeader eyebrow="Explore" title="Discover what is happening" description="Trending topics, people open to collaborating, and the latest public posts." />

      <section aria-labelledby="tags-title">
        <h2 id="tags-title" className="eyebrow mb-3 flex items-center gap-2">
          <Hash className="size-3.5" aria-hidden="true" /> Trending tags
        </h2>
        {tags.length === 0 ? (
          <p className="text-muted-foreground text-sm">No trending tags yet. They appear as people use #hashtags in public posts.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {tags.map((t) => (
              <li key={t.tag}>
                <Link href={`/explore?tag=${t.tag}`} className="hover:border-primary/50 flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium">
                  #{t.tag}
                  <span className="text-muted-foreground text-xs">{Number(t.uses)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="collab-title">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="collab-title" className="eyebrow flex items-center gap-2">
            <Handshake className="size-3.5" aria-hidden="true" /> Open to collaborate at your college
          </h2>
          <Link href="/search?type=people&collab=1" className="text-blue-text text-sm font-semibold hover:underline">
            See more
          </Link>
        </div>
        {collaborators.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nobody from your college has marked themselves open to collaboration yet.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {collaborators.map((p) => (
              <li key={p.id}>
                <PersonCard person={p} actions={<QuickConnect personId={p.id} />} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="recent-title" className="mx-auto max-w-2xl">
        <h2 id="recent-title" className="eyebrow mb-3 flex items-center gap-2">
          <Sparkles className="size-3.5" aria-hidden="true" /> Latest public posts
        </h2>
        {recent.items.length === 0 ? (
          <EmptyState title="No public posts yet">Public posts from across UniSphere appear here.</EmptyState>
        ) : (
          <ul className="space-y-4">
            {recent.items.map((p) => (
              <li key={p.id}>
                <PostCard post={p} viewerId={user.id} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
