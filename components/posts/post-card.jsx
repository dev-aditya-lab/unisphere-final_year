import Link from "next/link";
import { Globe, GraduationCap, Lock, Repeat2, ShieldAlert, Users } from "lucide-react";
import { AuthorLine } from "@/components/posts/author-line";
import { CategoryBadge } from "@/components/posts/category-badge";
import { PostActions } from "@/components/posts/post-actions";
import { RichText } from "@/components/posts/rich-text";
import { excerpt } from "@/lib/text";
import { CATEGORY_BY_VALUE } from "@/lib/content/post-meta";
import { privateFileUrl } from "@/lib/media";
import { cn } from "@/lib/utils";

const VISIBILITY_ICON = { public: Globe, college: GraduationCap, connections: Users, private: Lock, community: Users };
const VISIBILITY_LABEL = { public: "All members", college: "College", connections: "Connections", private: "Only you", community: "Community" };

export function postPath(post) {
  return `${post.category === "ideas" ? "/ideas/" : "/posts/"}${post.slug}`;
}

function Attachments({ items }) {
  if (!items?.length) return null;
  const cols = items.length === 1 ? "grid-cols-1" : "grid-cols-2";
  return (
    <ul className={cn("mt-3 grid gap-1.5 overflow-hidden rounded-lg", cols)}>
      {items.map((a, i) => (
        <li key={a.id} className={cn("bg-muted relative overflow-hidden", items.length === 1 ? "aspect-[16/10]" : "aspect-square", items.length === 3 && i === 0 && "row-span-2 aspect-auto")}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={privateFileUrl(a.id)} alt={a.alt || "Image attached to post"} loading="lazy" className="size-full object-cover" />
        </li>
      ))}
    </ul>
  );
}

function OriginalEmbed({ post }) {
  if (!post.original_slug) {
    return <p className="text-muted-foreground mt-3 rounded-lg border border-dashed p-3 text-sm">The original post is no longer available.</p>;
  }
  const href = `${post.original_category === "ideas" ? "/ideas/" : "/posts/"}${post.original_slug}`;
  return (
    <div className="mt-3 rounded-lg border p-3">
      <AuthorLine name={post.original_author_name} username={post.original_author_username} avatarKey={post.original_author_avatar_key} createdAt={post.original_created_at} size="xs" showType={false} />
      <Link prefetch={false} href={href} className="mt-2 block">
        {post.original_title && <p className="font-heading font-semibold hover:underline">{post.original_title}</p>}
        <p className="text-muted-foreground mt-0.5 text-sm">{excerpt(post.original_body, 220)}</p>
      </Link>
    </div>
  );
}

/**
 * One post in a feed or list. Pure presentation + a client action bar, so it renders on the server
 * and inside the client-side infinite feed alike. `full` shows the entire body (post page).
 */
export function PostCard({ post, viewerId, full = false, onDeleted, className, headingLevel = "h2" }) {
  const Heading = headingLevel;
  const href = postPath(post);
  const isRepost = Boolean(post.repost_of_id);
  const isPlainRepost = isRepost && !post.body;
  const long = !full && post.body.length > 500;
  const VisIcon = VISIBILITY_ICON[post.visibility] ?? Globe;

  if (post.status === "removed") {
    return (
      <article className={cn("surface p-4 sm:p-5", className)} aria-label="Removed post">
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <ShieldAlert className="size-4" aria-hidden="true" />
          This post was removed by a moderator for breaking the community guidelines.
        </p>
      </article>
    );
  }

  return (
    <article
      className={cn("surface-raised tone-stripe p-4 sm:p-5", CATEGORY_BY_VALUE[post.category]?.tone ?? "tone-stone", className)}
      aria-label={post.title || `Post by ${post.author_name}`}
    >
      {isRepost && (
        <p className="text-muted-foreground mb-2 flex items-center gap-1.5 text-xs font-medium">
          <Repeat2 className="size-3.5" aria-hidden="true" />
          {post.author_name} reposted
        </p>
      )}
      <div className="flex items-start justify-between gap-3">
        <AuthorLine
          name={post.author_name}
          username={post.author_username}
          avatarKey={post.author_avatar_key}
          verified={post.author_verified}
          blueTick={post.author_blue_tick}
          accountType={post.author_account_type}
          createdAt={post.created_at}
          edited={Boolean(post.edited_at)}
        />
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-muted-foreground hidden items-center gap-1 text-xs sm:flex" title={`Visible to: ${VISIBILITY_LABEL[post.visibility]}`}>
            <VisIcon className="size-3.5" aria-hidden="true" />
            <span className="sr-only">Visible to </span>
            {VISIBILITY_LABEL[post.visibility]}
          </span>
          {!isPlainRepost && <CategoryBadge category={post.category} />}
        </div>
      </div>

      {!isPlainRepost && (
        <div className="mt-3">
          {post.title && (
            <Heading className="font-heading text-xl leading-snug font-bold tracking-tight">
              {full ? post.title : (
                <Link prefetch={false} href={href} className="hover:underline">
                  {post.title}
                </Link>
              )}
            </Heading>
          )}
          <RichText text={long ? excerpt(post.body, 500) : post.body} className={cn("text-[15px] leading-relaxed", post.title && "mt-1.5")} />
          {long && (
            <Link prefetch={false} href={href} className="text-blue-text mt-1 inline-block text-sm font-bold hover:underline">
              Read more
            </Link>
          )}
        </div>
      )}

      {isRepost && <OriginalEmbed post={post} />}
      <Attachments items={post.attachments} />

      <div className="mt-3 border-t pt-2">
        <PostActions post={post} viewerId={viewerId} onDeleted={onDeleted} />
      </div>
    </article>
  );
}
