"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bookmark, Check, Flag, Heart, Link2, MessageCircle, MoreHorizontal, Pencil, Repeat2, Share2, SmilePlus, Trash2 } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import { PopIcon } from "@/components/motion/pop-icon";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ReportDialog } from "@/components/posts/report-dialog";
import { EditPostDialog } from "@/components/posts/edit-post-dialog";
import { deletePostAction, repostAction, setBookmarkAction, setReactionAction } from "@/lib/actions/posts";
import { REACTIONS } from "@/lib/content/post-meta";
import { publicEnv } from "@/lib/env-public";
import { compactNumber } from "@/lib/format";
import { useLatestWins } from "@/hooks/use-latest-wins";
import { cn } from "@/lib/utils";

const REACTION_LABEL = Object.fromEntries(REACTIONS.map((r) => [r.value, r.label]));

function postUrl(post) {
  return `${publicEnv.appUrl}${post.category === "ideas" ? "/ideas/" : "/posts/"}${post.slug}`;
}

/**
 * Mounts a heavy dialog only once it has been opened (and keeps it, so its close animation still plays). A feed of 15
 * posts would otherwise build four dialog trees per post that almost nobody opens.
 */
function MountOnOpen({ open, children }) {
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);
  return mounted ? children : null;
}

export function PostActions({ post, viewerId, onDeleted, className }) {
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
      return res.ok ? { ok: true } : { ok: false, error: res.error };
    },
    onError: (message, attempted) =>
      toast.error(message ?? "Could not update your bookmark.", { action: { label: "Retry", onClick: () => setBookmarked(attempted) } }),
  });

  const [reactOpen, setReactOpen] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [quote, setQuote] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  function react(next) {
    const value = next === reaction ? null : next;
    setReactionState({ reaction: value, count: count + (value && !reaction ? 1 : !value && reaction ? -1 : 0) });
    setReactOpen(false);
  }

  function toggleBookmark() {
    setBookmarked(!bookmarked);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(postUrl(post));
      toast.success("Link copied");
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Could not copy the link");
    }
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

  async function doDelete() {
    setBusy(true);
    const res = await deletePostAction(post.id);
    setBusy(false);
    setDeleteOpen(false);
    if (res.ok) {
      toast.success("Post deleted");
      // A list that owns the post removes it itself; refreshing the whole page as well would re-run every query on it.
      if (onDeleted) onDeleted(post.id);
      else router.refresh();
    } else toast.error(res.error);
  }

  const btn = "text-muted-foreground hover:text-foreground h-8 gap-1.5 px-2 text-xs font-medium";

  return (
    <div className={cn("flex items-center gap-0.5", className)}>
      {/* React */}
      {viewerId ? (
        <Popover open={reactOpen} onOpenChange={setReactOpen}>
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="sm"
              className={cn(btn, reaction && "text-coral-text hover:text-coral-text")}
              onClick={() => react(reaction ?? "like")}
              aria-pressed={Boolean(reaction)}
              aria-label={reaction ? `You reacted: ${REACTION_LABEL[reaction]}. Click to remove` : "Like"}
            >
              <PopIcon active={Boolean(reaction)}>
                <Heart className={cn("size-4", reaction && "fill-current")} aria-hidden="true" />
              </PopIcon>
              <span>{reaction ? REACTION_LABEL[reaction] : "Like"}</span>
              {count > 0 && <span className="tabular-nums">· {compactNumber(count)}</span>}
            </Button>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="text-muted-foreground -ml-1" aria-label="Choose a reaction">
                <SmilePlus className="size-4" />
              </Button>
            </PopoverTrigger>
          </div>
          <PopoverContent align="start" className="w-auto p-1.5">
            <div role="group" aria-label="Reactions" className="flex gap-1">
              {REACTIONS.map((r) => (
                <Button key={r.value} variant={reaction === r.value ? "soft" : "ghost"} size="sm" onClick={() => react(r.value)} className="h-8 text-xs">
                  {r.label}
                </Button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      ) : (
        <Button asChild variant="ghost" size="sm" className={btn}>
          <Link href={loginHref}>
            <Heart className="size-4" aria-hidden="true" />
            Like {count > 0 && <span className="tabular-nums">· {compactNumber(count)}</span>}
          </Link>
        </Button>
      )}

      {/* Comment */}
      <Button asChild variant="ghost" size="sm" className={btn}>
        <Link prefetch={false} href={`${post.category === "ideas" ? "/ideas/" : "/posts/"}${post.slug}#comments`}>
          <MessageCircle className="size-4" aria-hidden="true" />
          {post.comment_count > 0 ? <span className="tabular-nums">{compactNumber(post.comment_count)}</span> : <span className="sr-only sm:not-sr-only">Comment</span>}
          {post.comment_count > 0 && <span className="sr-only"> comments</span>}
        </Link>
      </Button>

      {/* Repost */}
      {viewerId && post.visibility !== "private" && post.visibility !== "connections" && post.visibility !== "community" && !isOwner ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className={btn} aria-label="Repost options">
              <Repeat2 className="size-4" aria-hidden="true" />
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
        <span className="text-muted-foreground flex items-center gap-1.5 px-2 text-xs">
          <Repeat2 className="size-4" aria-hidden="true" />
          <span className="tabular-nums">{compactNumber(post.repost_count)}</span>
          <span className="sr-only"> reposts</span>
        </span>
      ) : null}

      <div className="ml-auto flex items-center">
        {viewerId && (
          <Button variant="ghost" size="icon-sm" className={cn("text-muted-foreground", bookmarked && "text-sun-text")} onClick={toggleBookmark} aria-pressed={bookmarked} aria-label={bookmarked ? "Remove bookmark" : "Bookmark"}>
            <PopIcon active={bookmarked}>
              <Bookmark className={cn("size-4", bookmarked && "fill-current")} />
            </PopIcon>
          </Button>
        )}
        <Button variant="ghost" size="icon-sm" className="text-muted-foreground" onClick={copyLink} aria-label="Copy link to post">
          <AnimatePresence mode="wait" initial={false}>
            <m.span
              key={copied ? "done" : "share"}
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.4, opacity: 0 }}
              transition={{ duration: 0.14 }}
              className="grid place-items-center"
            >
              {copied ? <Check className="text-success-text size-4" /> : <Share2 className="size-4" />}
            </m.span>
          </AnimatePresence>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label="More actions">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onSelect={copyLink}>
              <Link2 /> Copy link
            </DropdownMenuItem>
            {isOwner && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setEditOpen(true)}>
                  <Pencil /> Edit post
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)}>
                  <Trash2 /> Delete post
                </DropdownMenuItem>
              </>
            )}
            {viewerId && !isOwner && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setReportOpen(true)}>
                  <Flag /> Report post
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Dialogs: built only once they are first opened */}
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

      <MountOnOpen open={deleteOpen}>
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this post?</AlertDialogTitle>
            <AlertDialogDescription>It disappears for everyone, including its comments. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive-text text-background hover:bg-destructive-text/90" onClick={doDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </MountOnOpen>

      <MountOnOpen open={reportOpen}>
        <ReportDialog open={reportOpen} onOpenChange={setReportOpen} targetType="post" targetId={post.id} />
      </MountOnOpen>
      {isOwner && (
        <MountOnOpen open={editOpen}>
          <EditPostDialog open={editOpen} onOpenChange={setEditOpen} post={post} />
        </MountOnOpen>
      )}
    </div>
  );
}
