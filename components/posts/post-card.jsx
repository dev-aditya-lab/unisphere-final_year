import Link from "next/link";
import { ArrowRight, Repeat2 } from "lucide-react";
import { Compass, Globe, GraduationCap, Lock, ShieldAlert, Users } from "@/components/icons/lucide-compat";
import { AuthorLine } from "@/components/posts/author-line";
import { CategoryBadge } from "@/components/posts/category-badge";
import { PostActions } from "@/components/posts/post-actions";
import { PostMedia } from "@/components/posts/post-media";
import { PostSummary } from "@/components/posts/post-summary";
import { PostMenu } from "@/components/posts/post-menu";
import { MarkdownText } from "@/components/posts/markdown-text";
import { markdownExcerpt, markdownToPlain } from "@/lib/markdown";
import { cn } from "@/lib/utils";

const VISIBILITY_ICON = { public: Globe, college: GraduationCap, connections: Users, private: Lock, community: Users };
const VISIBILITY_LABEL = { public: "All members", college: "College", connections: "Connections", private: "Only you", community: "Community" };

export function postPath(post) {
  return `${post.category === "ideas" ? "/ideas/" : "/posts/"}${post.slug}`;
}

function OriginalEmbed({ post }) {
  if (!post.original_slug) {
    return <p className="text-muted-foreground mt-3 rounded-xl border border-dashed p-3 text-sm">The original post is no longer available.</p>;
  }
  const href = `${post.original_category === "ideas" ? "/ideas/" : "/posts/"}${post.original_slug}`;
  return (
    <div className="bg-muted/50 mt-3 rounded-xl border p-3">
      <AuthorLine name={post.original_author_name} username={post.original_author_username} avatarKey={post.original_author_avatar_key} createdAt={post.original_created_at} size="xs" showType={false} />
      <Link href={href} className="mt-2 block">
        {post.original_title && <p className="font-heading font-semibold hover:underline">{post.original_title}</p>}
        <p className="text-muted-foreground mt-0.5 text-sm [overflow-wrap:anywhere]">{markdownToPlain(post.original_body, 220)}</p>
      </Link>
    </div>
  );
}

/**
 * One post in a feed or list. Pure presentation + a client action bar and menu, so it renders on the server
 * and inside the client-side infinite feed alike. `full` shows the entire body (post page).
 *
 * Social layout: a large avatar with the name and time, the type as a small coloured pill beside the menu (only for a
 * specific type; "General" says nothing), big readable text, rounded media, and a bar of pill-shaped actions. Every post
 * is its own rounded card with a gap around it, on a phone too, so a feed reads as separate posts and not one long article.
 * Off-screen cards skip rendering (`feed-card`), which keeps long feeds light.
 */
export function PostCard({ post, viewerId, full = false, onDeleted, onDismissed, canSummarize = false, className, headingLevel = "h2" }) {
  const Heading = headingLevel;
  const href = postPath(post);
  const isRepost = Boolean(post.repost_of_id);
  const isPlainRepost = isRepost && !post.body;
  const long = !full && post.body.length > 500;
  const VisIcon = VISIBILITY_ICON[post.visibility] ?? Globe;
  const narrowAudience = post.visibility && post.visibility !== "public";
  const shell = "feed-card bg-card border-border-strong/60 shadow-card rounded-2xl border p-4 transition-shadow duration-200 sm:rounded-3xl sm:p-5 sm:hover:shadow-[var(--lift-shadow)]";

  if (post.status === "removed") {
    return (
      <article className={cn(shell, className)} aria-label="Removed post">
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <ShieldAlert className="size-4 shrink-0" aria-hidden="true" />
          This post was removed by a moderator for breaking the community guidelines.
        </p>
      </article>
    );
  }

  return (
    <article className={cn(shell, className)} aria-label={post.title || `Post by ${post.author_name}`}>
      {post.why && (
        <p className="text-muted-foreground mb-2 flex items-center gap-1.5 text-xs font-medium">
          <Compass className="size-3.5" aria-hidden="true" />
          {post.why}
        </p>
      )}
      {isRepost && (
        <p className="text-muted-foreground mb-2 flex items-center gap-1.5 text-xs font-medium">
          <Repeat2 className="size-3.5" aria-hidden="true" />
          {post.author_name} reposted
        </p>
      )}
      <div className="flex items-start justify-between gap-2">
        <AuthorLine
          size="post"
          prominent
          name={post.author_name}
          username={post.author_username}
          avatarKey={post.author_avatar_key}
          blueTick={post.author_blue_tick}
          accountType={post.author_account_type}
          createdAt={post.created_at}
          edited={Boolean(post.edited_at)}
        >
          {narrowAudience && (
            <>
              <span aria-hidden="true">·</span>
              <span className="inline-flex shrink-0 items-center gap-1" title={`Visible to: ${VISIBILITY_LABEL[post.visibility]}`}>
                <VisIcon className="size-3" aria-hidden="true" />
                <span className="sr-only">Visible to </span>
                <span className="max-sm:sr-only">{VISIBILITY_LABEL[post.visibility]}</span>
              </span>
            </>
          )}
        </AuthorLine>
        <div className="-mt-0.5 -mr-1.5 flex shrink-0 items-center gap-1">
          {!isPlainRepost && post.category !== "general" && <CategoryBadge category={post.category} compact />}
          <PostMenu post={post} viewerId={viewerId} onDeleted={onDeleted} onDismissed={onDismissed} />
        </div>
      </div>

      {!isPlainRepost && (
        <div className="mt-3.5">
          {post.title && (
            <Heading className="font-heading text-lg leading-snug font-bold tracking-tight [overflow-wrap:anywhere] sm:text-xl">
              {full ? (
                post.title
              ) : (
                <Link href={href} className="hover:underline">
                  {post.title}
                </Link>
              )}
            </Heading>
          )}
          <MarkdownText text={long ? markdownExcerpt(post.body, 500) : post.body} className={cn("text-base leading-relaxed", post.title && "mt-1.5")} />
          {long && (
            <Link href={href} className="text-primary-text group/more mt-1.5 inline-flex min-h-8 items-center gap-1 text-sm font-semibold">
              <span className="group-hover/more:underline">Read more</span>
              <ArrowRight className="size-3.5 transition-transform duration-200 group-hover/more:translate-x-0.5" aria-hidden="true" />
            </Link>
          )}
        </div>
      )}

      {canSummarize && !isRepost && post.body.length >= 600 && <PostSummary post={post} />}

      {isRepost && <OriginalEmbed post={post} />}
      <PostMedia items={post.attachments} className="mt-3.5 rounded-2xl" />

      <PostActions post={post} viewerId={viewerId} className="mt-4" />
    </article>
  );
}
