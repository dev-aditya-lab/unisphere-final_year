"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bookmark, Check, Flag, Heart, Link2, MessageCircle, MoreHorizontal, Pencil, Repeat2, Share2, SmilePlus, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
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
import { cn } from "@/lib/utils";

const REACTION_LABEL = Object.fromEntries(REACTIONS.map((r) => [r.value, r.label]));

function postUrl(post) {
  return `${publicEnv.appUrl}${post.category === "ideas" ? "/ideas/" : "/posts/"}${post.slug}`;
}

export function PostActions({ post, viewerId, onDeleted, className }) {
  const router = useRouter();
  const loginHref = `/login?next=${encodeURIComponent(`/posts/${post.slug}`)}`;
  const isOwner = viewerId === post.author_id;

  // Optimistic state: updated immediately, rolled back if the server rejects the change.
  const [reaction, setReaction] = useState(post.my_reaction ?? null);
  const [count, setCount] = useState(post.reaction_count ?? 0);
  const [bookmarked, setBookmarked] = useState(Boolean(post.bookmarked));
  const [, startTransition] = useTransition();

  const [reactOpen, setReactOpen] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [quote, setQuote] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  function react(next) {
    const prev = { reaction, count };
    const value = next === reaction ? null : next;
    setReaction(value);
    setCount(count + (value && !reaction ? 1 : !value && reaction ? -1 : 0));
    setReactOpen(false);
    startTransition(async () => {
      const res = await setReactionAction({ postId: post.id, reaction: value });
      if (res.ok) {
        setCount(res.reactionCount);
        setReaction(res.myReaction);
      } else {
        setReaction(prev.reaction);
        setCount(prev.count);
        toast.error(res.error ?? "Could not save your reaction.");
      }
    });
  }

  function toggleBookmark() {
    const prev = bookmarked;
    setBookmarked(!prev);
    startTransition(async () => {
      const res = await setBookmarkAction({ postId: post.id, bookmarked: !prev });
      if (!res.ok) {
        setBookmarked(prev);
        toast.error(res.error ?? "Could not update your bookmark.");
      } else toast.success(!prev ? "Saved to bookmarks" : "Removed from bookmarks");
    });
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
      onDeleted?.(post.id);
      router.refresh();
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
        <Link href={`${post.category === "ideas" ? "/ideas/" : "/posts/"}${post.slug}#comments`}>
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
            <motion.span
              key={copied ? "done" : "share"}
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.4, opacity: 0 }}
              transition={{ duration: 0.14 }}
              className="grid place-items-center"
            >
              {copied ? <Check className="text-success-text size-4" /> : <Share2 className="size-4" />}
            </motion.span>
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

      {/* Dialogs */}
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

      <ReportDialog open={reportOpen} onOpenChange={setReportOpen} targetType="post" targetId={post.id} />
      {isOwner && <EditPostDialog open={editOpen} onOpenChange={setEditOpen} post={post} />}
    </div>
  );
}
