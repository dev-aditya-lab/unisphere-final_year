import Link from "next/link";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { CommentsSection } from "@/components/posts/comments";
import { SummarizeDiscussion } from "@/components/ai/summarize-discussion";
import { getAiUiState } from "@/lib/ai/ui-state";
import { PostCard } from "@/components/posts/post-card";
import { JsonLd } from "@/components/json-ld";
import { getComments } from "@/lib/services/posts";
import { getCurrentProfile } from "@/lib/auth/session";
import { CATEGORY_BY_VALUE } from "@/lib/content/post-meta";
import { publicEnv } from "@/lib/env-public";
import { excerpt } from "@/lib/text";

/** Shared body of /posts/[slug] and /ideas/[slug]. `aside` is reserved for contextual panels. */
export async function PostPageContent({ post, viewerId, section = { href: "/feed", label: "Feed" }, children }) {
  const [comments, viewer] = await Promise.all([getComments(post.id), viewerId ? getCurrentProfile() : null]);
  const ai = viewer ? await getAiUiState(viewer) : null;
  const canSummarize = Boolean(ai?.assist) && post.comment_count >= 3 && ["public", "college"].includes(post.visibility);
  const isPublic = post.visibility === "public";
  const url = `${publicEnv.appUrl}${post.category === "ideas" ? "/ideas/" : "/posts/"}${post.slug}`;

  return (
    <div className="mx-auto max-w-3xl">
      {isPublic && (
        <JsonLd
          data={[
            {
              "@context": "https://schema.org",
              "@type": "DiscussionForumPosting",
              headline: post.title || excerpt(post.body, 90),
              articleBody: post.body,
              datePublished: post.created_at,
              dateModified: post.edited_at ?? post.created_at,
              url,
              author: { "@type": "Person", name: post.author_name, url: `${publicEnv.appUrl}/u/${post.author_username}` },
              interactionStatistic: [
                { "@type": "InteractionCounter", interactionType: "https://schema.org/CommentAction", userInteractionCount: post.comment_count },
                { "@type": "InteractionCounter", interactionType: "https://schema.org/LikeAction", userInteractionCount: post.reaction_count },
              ],
            },
            {
              "@context": "https://schema.org",
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "UniSphere", item: publicEnv.appUrl },
                { "@type": "ListItem", position: 2, name: CATEGORY_BY_VALUE[post.category]?.label ?? "Post", item: url },
              ],
            },
          ]}
        />
      )}
      <Breadcrumb className="mb-4">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href={viewerId ? section.href : "/"}>{viewerId ? section.label : "Home"}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{post.title || excerpt(post.body, 40) || "Post"}</BreadcrumbPage>
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
  const description = excerpt(post.body, 160) || `A post by ${post.author_name} on UniSphere.`;
  const isPublic = post.visibility === "public" && post.status === "published";
  return {
    title,
    description,
    alternates: { canonical: path },
    robots: isPublic ? { index: true, follow: true } : { index: false, follow: false },
    openGraph: isPublic ? { type: "article", title, description, url: path, publishedTime: post.created_at, authors: [post.author_name] } : undefined,
    twitter: isPublic ? { card: "summary_large_image", title, description } : undefined,
  };
}
