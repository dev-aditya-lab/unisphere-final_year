import Link from "next/link";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { CommentsSection } from "@/components/posts/comments";
import { SummarizeDiscussion } from "@/components/ai/summarize-discussion";
import { getAiUiState } from "@/lib/ai/ui-state";
import { PostCard } from "@/components/posts/post-card";
import { getComments } from "@/lib/services/posts";
import { getCurrentProfile } from "@/lib/auth/session";
import { CATEGORY_BY_VALUE } from "@/lib/content/post-meta";
import { publicEnv } from "@/lib/env-public";
import { excerpt } from "@/lib/text";
import { markdownToPlain } from "@/lib/markdown";

/** Shared body of /posts/[slug] and /ideas/[slug]. `aside` is reserved for contextual panels. */
export async function PostPageContent({ post, viewerId, section = { href: "/feed", label: "Feed" }, children }) {
  const [comments, viewer] = await Promise.all([getComments(post.id), viewerId ? getCurrentProfile() : null]);
  const ai = viewer ? await getAiUiState(viewer) : null;
  const canSummarize = Boolean(ai?.assist) && post.comment_count >= 3 && ["public", "college"].includes(post.visibility);

  return (
    <div className="mx-auto max-w-3xl">
      <Breadcrumb className="mb-4">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href={viewerId ? section.href : "/"}>{viewerId ? section.label : "Home"}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{post.title || excerpt(markdownToPlain(post.body), 40) || "Post"}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <PostCard post={post} viewerId={viewerId} full headingLevel="h1" />
      {canSummarize && <SummarizeDiscussion postId={post.id} />}
      {children}
      <div className="mt-8">
        <CommentsSection postId={post.id} initialComments={comments} viewer={viewer ? { id: viewer.id, full_name: viewer.full_name, avatar_key: viewer.avatar_key } : null} />
      </div>
    </div>
  );
}

export function postMetadata(post, path) {
  if (!post) return { title: "Post not found", robots: { index: false, follow: false } };
  const title = post.title || `${post.author_name} on UniSphere`;
  const description = excerpt(markdownToPlain(post.body), 160) || `A post by ${post.author_name} on UniSphere.`;
  const isPublic = false; // closed network: member content is never indexed or given a public preview
  return {
    title,
    description,
    alternates: { canonical: path },
    robots: isPublic ? { index: true, follow: true } : { index: false, follow: false },
    openGraph: isPublic ? { type: "article", title, description, url: path, publishedTime: post.created_at, authors: [post.author_name] } : undefined,
    twitter: isPublic ? { card: "summary_large_image", title, description } : undefined,
  };
}
