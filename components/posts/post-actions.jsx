"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bookmark, Check, Heart, MessageCircle, Pencil, Repeat2, Share2, SmilePlus } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import { PopIcon } from "@/components/motion/pop-icon";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCopyLink } from "@/components/posts/use-copy-link";
import { emitPostChanged } from "@/lib/client/feed-events";
import { repostAction, setBookmarkAction, setReactionAction } from "@/lib/actions/posts";
import { REACTIONS } from "@/lib/content/post-meta";
import { compactNumber } from "@/lib/format";
import { useLatestWins } from "@/hooks/use-latest-wins";
import { cn } from "@/lib/utils";

const REACTION_LABEL = Object.fromEntries(REACTIONS.map((r) => [r.value, r.label]));

/**
 * Mounts a heavy dialog only once it has been opened (and keeps it, so its close animation still plays).
 */
function MountOnOpen({ open, children }) {
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);
  return mounted ? children : null;
}

// Every action is at least 40px tall on a phone (36px with a mouse) and reads as a quiet, tinted-on-hover control.
const ACTION = "text-muted-foreground hover:text-foreground h-10 gap-1.5 rounded-full px-3 text-[13px] font-medium sm:h-9 max-sm:min-w-10";

/** The action row under a post: react, comment, repost, bookmark and share. The post's own menu lives in its header. */
export function PostActions({ post, viewerId, className }) {
  const router = useRouter();
  const loginHref = `/login?next=${encodeURIComponent(`/posts/${post.slug}`)}`;
  const isOwner = viewerId === post.author_id;

  // Optimistic state: shown immediately, saved one request at a time with the member's latest choice winning, and
  // rolled back (with a Retry) if the server rejects it. Rapid taps can no longer finish out of order.
  const [reactionState, setReactionState] = useLatestWins(
    { reaction: post.my_reaction ?? null, count: post.reaction_count ?? 0 },
    {
      equals: (a, b) => a.reaction === b.reaction,
      save: async ({ reaction: next }) => {
        const res = await setReactionAction({ postId: post.id, reaction: next });
        if (res.ok) emitPostChanged(post.id, { my_reaction: res.myReaction, reaction_count: res.reactionCount, reactions: res.reactions });
        return res.ok ? { ok: true, value: { reaction: res.myReaction, count: res.reactionCount } } : { ok: false, error: res.error };
      },
      onError: (message, attempted) =>
        toast.error(message ?? "Could not save your reaction.", { action: { label: "Retry", onClick: () => setReactionState(attempted) } }),
    },
  );
  const { reaction, count } = reactionState;
  const [bookmarked, setBookmarked] = useLatestWins(Boolean(post.bookmarked), {
    save: async (next) => {
      const res = await setBookmarkAction({ postId: post.id, bookmarked: next });
      if (res.ok) emitPostChanged(post.id, { bookmarked: next });
      return res.ok ? { ok: true } : { ok: false, error: res.error };
    },
    onError: (message, attempted) =>
      toast.error(message ?? "Could not update your bookmark.", { action: { label: "Retry", onClick: () => setBookmarked(attempted) } }),
  });

  const [reactOpen, setReactOpen] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [quote, setQuote] = useState("");
  const [busy, setBusy] = useState(false);
  const { copied, copy } = useCopyLink(post);

  function react(next) {
    const value = next === reaction ? null : next;
    setReactionState({ reaction: value, count: count + (value && !reaction ? 1 : !value && reaction ? -1 : 0) });
    setReactOpen(false);
  }

  async function doRepost(comment) {
    setBusy(true);
    const res = await repostAction({ postId: post.id, comment: comment || undefined });
    setBusy(false);
    if (res.ok) {
      toast.success(comment ? "Quote posted" : "Reposted");
      setQuoteOpen(false);
      setQuote("");
      router.refresh();
    } else toast.error(res.error);
  }

  const commentHref = `${post.category === "ideas" ? "/ideas/" : "/posts/"}${post.slug}#comments`;

  return (
    <div className={cn("flex items-center gap-0.5", className)}>
      {/* React */}
      {viewerId ? (
        <Popover open={reactOpen} onOpenChange={setReactOpen}>
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="sm"
              className={cn(ACTION, reaction && "text-rose-text hover:text-rose-text")}
              onClick={() => react(reaction ?? "like")}
              aria-pressed={Boolean(reaction)}
              aria-label={reaction ? `You reacted: ${REACTION_LABEL[reaction]}. Click to remove` : "Like"}
            >
              <PopIcon active={Boolean(reaction)}>
                <Heart className={cn("size-[18px]", reaction && "fill-current")} aria-hidden="true" />
              </PopIcon>
              {(count > 0 || reaction) && (
                <span className="tabular-nums">
                  {count > 0 && compactNumber(count)}
                  {reaction && <span className="hidden sm:inline">{count > 0 ? " · " : ""}{REACTION_LABEL[reaction]}</span>}
                </span>
              )}
            </Button>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-foreground -ml-1.5 rounded-full max-sm:size-10" aria-label="Choose a reaction">
                <SmilePlus className="size-4" />
              </Button>
            </PopoverTrigger>
          </div>
          <PopoverContent align="start" className="w-auto max-w-[calc(100vw-1.5rem)] p-1.5">
            <div role="group" aria-label="Reactions" className="flex flex-wrap gap-1">
              {REACTIONS.map((r) => (
                <Button key={r.value} variant={reaction === r.value ? "soft" : "ghost"} size="sm" onClick={() => react(r.value)} className="h-9 text-xs">
                  {r.label}
                </Button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      ) : (
        <Button asChild variant="ghost" size="sm" className={ACTION}>
          <Link href={loginHref} aria-label={count > 0 ? `Like (${count})` : "Like"}>
            <Heart className="size-[18px]" aria-hidden="true" />
            {count > 0 && <span className="tabular-nums">{compactNumber(count)}</span>}
          </Link>
        </Button>
      )}

      {/* Comment */}
      <Button asChild variant="ghost" size="sm" className={ACTION}>
        <Link href={commentHref} aria-label={post.comment_count > 0 ? `Comments (${post.comment_count})` : "Comment"}>
          <MessageCircle className="size-[18px]" aria-hidden="true" />
          {post.comment_count > 0 && <span className="tabular-nums">{compactNumber(post.comment_count)}</span>}
        </Link>
      </Button>

      {/* Repost */}
      {viewerId && post.visibility !== "private" && post.visibility !== "connections" && post.visibility !== "community" && !isOwner ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className={ACTION} aria-label={post.repost_count > 0 ? `Repost options (${post.repost_count} reposts)` : "Repost options"}>
              <Repeat2 className="size-[18px]" aria-hidden="true" />
              {post.repost_count > 0 && <span className="tabular-nums">{compactNumber(post.repost_count)}</span>}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem disabled={busy} onSelect={() => doRepost("")}>
              <Repeat2 /> Repost
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setQuoteOpen(true)}>
              <Pencil /> Quote with a comment
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : post.repost_count > 0 ? (
        <span className="text-muted-foreground flex h-10 items-center gap-1.5 px-3 text-[13px] font-medium sm:h-9">
          <Repeat2 className="size-[18px]" aria-hidden="true" />
          <span className="tabular-nums">{compactNumber(post.repost_count)}</span>
          <span className="sr-only"> reposts</span>
        </span>
      ) : null}

      <div className="ml-auto flex items-center">
        {viewerId && (
          <Button
            variant="ghost"
            size="icon-sm"
            className={cn("text-muted-foreground hover:text-foreground rounded-full max-sm:size-10", bookmarked && "text-primary-text hover:text-primary-text")}
            onClick={() => setBookmarked(!bookmarked)}
            aria-pressed={bookmarked}
            aria-label={bookmarked ? "Remove bookmark" : "Bookmark"}
          >
            <PopIcon active={bookmarked}>
              <Bookmark className={cn("size-[18px]", bookmarked && "fill-current")} />
            </PopIcon>
          </Button>
        )}
        <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-foreground rounded-full max-sm:size-10" onClick={copy} aria-label="Copy link to post">
          <AnimatePresence mode="wait" initial={false}>
            <m.span
              key={copied ? "done" : "share"}
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.4, opacity: 0 }}
              transition={{ duration: 0.14 }}
              className="grid place-items-center"
            >
              {copied ? <Check className="text-success-text size-[18px]" /> : <Share2 className="size-[18px]" />}
            </m.span>
          </AnimatePresence>
        </Button>
      </div>

      <MountOnOpen open={quoteOpen}>
        <Dialog open={quoteOpen} onOpenChange={setQuoteOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Quote this post</DialogTitle>
              <DialogDescription>Your comment appears above the original, which stays credited to its author.</DialogDescription>
            </DialogHeader>
            <Textarea rows={4} maxLength={2000} value={quote} onChange={(e) => setQuote(e.target.value)} aria-label="Your comment" placeholder="Add your thoughts…" />
            <DialogFooter>
              <Button variant="ghost" onClick={() => setQuoteOpen(false)}>
                Cancel
              </Button>
              <Button disabled={!quote.trim() || busy} onClick={() => doRepost(quote.trim())}>
                {busy ? "Posting…" : "Post quote"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </MountOnOpen>
    </div>
  );
}
