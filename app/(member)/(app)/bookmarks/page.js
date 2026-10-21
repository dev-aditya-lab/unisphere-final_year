import { Bookmark } from "@/components/icons/lucide-compat";
import { EmptyState } from "@/components/empty-state";
import { PostCard } from "@/components/posts/post-card";
import { PageHeader } from "@/components/shell/page-header";
import { requireProfile } from "@/lib/auth/session";
import { getBookmarkedPosts } from "@/lib/services/posts";

export const metadata = { title: "Bookmarks", robots: { index: false, follow: false } };

export default async function BookmarksPage() {
  const { user } = await requireProfile();
  const posts = await getBookmarkedPosts();
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader eyebrow="Saved" title="Bookmarks" description="Posts you saved. Only you can see this list." />
      {posts.length === 0 ? (
        <EmptyState icon={Bookmark} title="No bookmarks yet">
          Tap the bookmark icon on any post to keep it here for later.
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
