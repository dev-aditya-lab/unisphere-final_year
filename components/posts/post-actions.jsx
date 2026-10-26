"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Repeat2, Share2, SmilePlus } from "lucide-react";
import { MessageCircle, Pencil } from "@/components/icons/lucide-compat";
import { AppIcon } from "@/components/icons/app-icon";
import { AnimatedIcon } from "@/components/icons/animated-icon";
import { AnimatePresence, m } from "motion/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RollingNumber } from "@/components/motion/rolling-number";
import { REACTION_LABEL, ReactionIcon, ReactionStack, reactionUi } from "@/components/posts/reaction-ui";
import { useCopyLink } from "@/components/posts/use-copy-link";
import { emitPostChanged } from "@/lib/client/feed-events";
import { haptic } from "@/lib/client/haptics";
import { repostAction, setBookmarkAction, setReactionAction } from "@/lib/actions/posts";
import { REACTIONS } from "@/lib/content/post-meta";
import { useLatestWins } from "@/hooks/use-latest-wins";
import { cn } from "@/lib/utils";

/**
 * Mounts a heavy dialog only once it has been opened (and keeps it, so its close animation still plays).
 */
function MountOnOpen({ open, children }) {
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);
  return mounted ? children : null;
}

// Every action is a soft pill, 40px tall with 8px between them (a comfortable thumb target on a phone). Rest state is a quiet grey
// pill with the icon and the count; hover darkens it; a reaction tints the Like pill in its own colour; press shrinks it a little.
const PILL = "text-muted-foreground bg-muted/70 hover:bg-muted hover:text-foreground group/act h-10 gap-1.5 rounded-full px-3.5 text-sm font-semibold";
const ICON_PILL = "text-muted-foreground hover:bg-muted hover:text-foreground size-10 rounded-full";

const HOLD_MS = 380; // a touch held this long opens the tray (long enough to tell from a tap, short enough not to feel stuck)
const HOVER_OPEN_MS = 450; // a mouse resting on Like this long opens it, so passing over the button on the way elsewhere does not
const HOVER_CLOSE_MS = 260;

/** A ring of dots that flies outward once. Remount it (change `key`) to play it again. */
function Burst({ dots = 6 }) {
  return (
    <span className="react-burst" aria-hidden="true">
      {Array.from({ length: dots }, (_, i) => (
        <i key={i} style={{ "--a": `${(360 / dots) * i}deg` }} />
      ))}
    </span>
  );
}

/**
 * The action row under a post: react, comment, repost, then save and share on the right. The post's own menu lives in its header.
 *
 *  - Tap Like for a quick like; tap again to take it back. Touch and hold (or rest a mouse on it) for the tray of four
 *    reactions, each with its own icon and colour. The small face button beside Like opens the same tray with a tap or the keyboard,
 *    so nothing depends on discovering a gesture.
 *  - Counts roll like an odometer. A reaction springs in with a ring of dots; on a phone with a vibration motor it also ticks.
 *  - Everything is optimistic: it shows at once, saves one request at a time (the latest choice wins) and rolls back with a
 *    Retry if the server says no.
 */
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
  // Counters that restart the one-shot animations (a new key replays them); 0 means "nothing to play yet".
  const [reactPlay, setReactPlay] = useState(0);
  const [savePlay, setSavePlay] = useState(0);
  const { copied, share } = useCopyLink(post);

  // How many of each kind the post has, with this member's own pick swapped in, so the stack of small icons follows a tap at once.
  const kinds = useMemo(() => {
    const map = { ...(post.reactions ?? {}) };
    if (post.my_reaction && map[post.my_reaction] > 0) map[post.my_reaction] -= 1;
    if (reaction) map[reaction] = (map[reaction] ?? 0) + 1;
    return map;
  }, [post.reactions, post.my_reaction, reaction]);

  function react(next) {
    const value = next === reaction ? null : next;
    setReactionState({ reaction: value, count: count + (value && !reaction ? 1 : !value && reaction ? -1 : 0) });
    setReactOpen(false);
    if (value) {
      setReactPlay((n) => n + 1);
      haptic(12);
    } else haptic(6);
  }

  function toggleBookmark() {
    const next = !bookmarked;
    setBookmarked(next);
    if (next) {
      setSavePlay((n) => n + 1);
      haptic(10);
    }
  }

  // ── Opening the tray: long-press (touch), resting the mouse, or the keyboard ──────────────────────────────────────────
  const holdTimer = useRef(null);
  const hoverTimer = useRef(null);
  const closeTimer = useRef(null);
  const held = useRef(false); // the touch that just ended opened the tray, so its click must not also toggle the like
  const startPoint = useRef({ x: 0, y: 0 });
  const keyboardOpen = useRef(false);
  const anchorRef = useRef(null);
  useEffect(
    () => () => {
      clearTimeout(holdTimer.current);
      clearTimeout(hoverTimer.current);
      clearTimeout(closeTimer.current);
    },
    [],
  );

  const cancelHold = useCallback(() => clearTimeout(holdTimer.current), []);
  function onPointerDown(e) {
    if (e.pointerType === "mouse") return;
    held.current = false;
    startPoint.current = { x: e.clientX, y: e.clientY };
    clearTimeout(holdTimer.current);
    holdTimer.current = setTimeout(() => {
      held.current = true;
      haptic(18);
      setReactOpen(true);
    }, HOLD_MS);
  }
  function onPointerMove(e) {
    // A finger that is scrolling must not open the tray.
    if (Math.hypot(e.clientX - startPoint.current.x, e.clientY - startPoint.current.y) > 10) cancelHold();
  }
  function onClickLike() {
    if (held.current) {
      held.current = false;
      return;
    }
    react(reaction ?? "like");
  }
  function hoverEnter(e) {
    if (e.pointerType !== "mouse") return;
    clearTimeout(closeTimer.current);
    clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setReactOpen(true), HOVER_OPEN_MS);
  }
  function hoverLeave(e) {
    if (e.pointerType !== "mouse") return;
    clearTimeout(hoverTimer.current);
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setReactOpen(false), HOVER_CLOSE_MS);
  }
  function keepOpen() {
    clearTimeout(closeTimer.current);
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
  const mine = reaction ? reactionUi(reaction) : null;

  return (
    <div className={cn("flex items-center justify-between gap-2", className)}>
      <div className="flex items-center gap-2">
        {/* React */}
        {viewerId ? (
          <Popover open={reactOpen} onOpenChange={setReactOpen}>
            <PopoverAnchor asChild>
              <div ref={anchorRef} className="flex items-center gap-px" onPointerEnter={hoverEnter} onPointerLeave={hoverLeave}>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(PILL, "touch-manipulation rounded-r-none pr-2.5 [-webkit-touch-callout:none]", mine && cn(mine.tone, "bg-(--tone)/15 text-(--tone-text) hover:bg-(--tone)/25 hover:text-(--tone-text)"))}
                  onClick={onClickLike}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={cancelHold}
                  onPointerCancel={cancelHold}
                  onPointerLeave={cancelHold}
                  onContextMenu={(e) => e.preventDefault()}
                  aria-pressed={Boolean(reaction)}
                  aria-haspopup="true"
                  aria-label={reaction ? `You reacted: ${REACTION_LABEL[reaction]}. Click to remove` : "Like"}
                >
                  <span className="relative grid place-items-center">
                    {reaction ? (
                      <span key={reactPlay} className={reactPlay > 0 ? "react-pop" : "inline-grid"}>
                        <AppIcon name={mine.icon} size={21} fill="solid" />
                      </span>
                    ) : (
                      <AnimatedIcon name="heart" size={21} active={false} />
                    )}
                    {reactPlay > 0 && reaction && <Burst key={`b${reactPlay}`} />}
                  </span>
                  {count > 0 && <RollingNumber value={count} />}
                </Button>
                {/* The same tray, for anyone who does not find (or cannot do) touch-and-hold: a visible button, and a real tab stop. */}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className={cn("text-muted-foreground hover:text-foreground h-10 w-9 rounded-l-none rounded-r-full pr-1 pl-0.5", mine ? cn(mine.tone, "bg-(--tone)/15 text-(--tone-text) hover:bg-(--tone)/25") : "bg-muted/70 hover:bg-muted")}
                  aria-label="Choose a reaction"
                  aria-expanded={reactOpen}
                  onClick={() => {
                    keyboardOpen.current = true;
                    setReactOpen((o) => !o);
                  }}
                >
                  <SmilePlus className="size-4" />
                </Button>
              </div>
            </PopoverAnchor>
            <PopoverContent
              side="top"
              align="start"
              sideOffset={4}
              collisionPadding={8}
              className="bg-popover w-auto max-w-[calc(100vw-1rem)] rounded-full p-1 shadow-pop"
              onPointerEnter={keepOpen}
              onPointerLeave={hoverLeave}
              onOpenAutoFocus={(e) => {
                // A tray that opened by hover or long-press must not steal focus; one opened with the keyboard takes it.
                if (!keyboardOpen.current) e.preventDefault();
                keyboardOpen.current = false;
              }}
              onCloseAutoFocus={(e) => e.preventDefault()}
              // Pressing Like or the face button is not "outside": without this the tray would close on pointer-down and the click would reopen it.
              onInteractOutside={(e) => anchorRef.current?.contains(e.target) && e.preventDefault()}
            >
              <div role="group" aria-label="Reactions" className="flex items-center gap-0.5">
                {REACTIONS.map((r, i) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => react(r.value)}
                    aria-label={r.label}
                    aria-pressed={reaction === r.value}
                    style={{ "--i": i }}
                    className={cn(
                      "tray-item relative grid size-11 touch-manipulation place-items-center rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40",
                      reactionUi(r.value).tone,
                      reaction === r.value && "bg-(--tone)/15",
                    )}
                  >
                    <span className="tray-icon grid place-items-center text-(--tone-text)">
                      <AppIcon name={reactionUi(r.value).icon} size={26} fill={reaction === r.value ? "solid" : undefined} animate={false} />
                    </span>
                    <span className="tray-label bg-foreground text-background pointer-events-none absolute -top-6 rounded-md px-1.5 py-0.5 text-[11px] leading-none font-semibold whitespace-nowrap" aria-hidden="true">
                      {r.label}
                    </span>
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        ) : (
          <Button asChild variant="ghost" size="sm" className={PILL}>
            <Link href={loginHref} aria-label={count > 0 ? `Like (${count})` : "Like"}>
              <AppIcon name="heart" size={21} state="idle" />
              {count > 0 && <RollingNumber value={count} />}
            </Link>
          </Button>
        )}
        <ReactionStack counts={kinds} className="mr-1 ml-0.5" />

        {/* Comment */}
        <Button asChild variant="ghost" size="sm" className={PILL}>
          <Link href={commentHref} aria-label={post.comment_count > 0 ? `Comments (${post.comment_count})` : "Comment"}>
            <MessageCircle className="size-5" aria-hidden="true" />
            {post.comment_count > 0 && <RollingNumber value={post.comment_count} />}
          </Link>
        </Button>

        {/* Repost */}
        {viewerId && post.visibility !== "private" && post.visibility !== "connections" && post.visibility !== "community" && !isOwner ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className={PILL} aria-label={post.repost_count > 0 ? `Repost options (${post.repost_count} reposts)` : "Repost options"}>
                <Repeat2 className="size-5 transition-transform duration-300 ease-out group-active/act:rotate-180 group-data-[state=open]/act:rotate-180" aria-hidden="true" />
                {post.repost_count > 0 && <RollingNumber value={post.repost_count} />}
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
          <span className="text-muted-foreground bg-muted/70 flex h-10 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold">
            <Repeat2 className="size-5" aria-hidden="true" />
            <span className="tabular-nums">{post.repost_count}</span>
            <span className="sr-only"> reposts</span>
          </span>
        ) : null}
      </div>

      <div className="flex items-center gap-0.5">
        {viewerId && (
          <Button
            variant="ghost"
            size="icon-sm"
            className={cn(ICON_PILL, "relative", bookmarked && "text-primary-text hover:text-primary-text")}
            onClick={toggleBookmark}
            aria-pressed={bookmarked}
            aria-label={bookmarked ? "Remove bookmark" : "Bookmark"}
          >
            <AnimatedIcon name="bookmark" size={21} active={bookmarked} />
            {savePlay > 0 && bookmarked && <Burst key={`s${savePlay}`} dots={5} />}
          </Button>
        )}
        <Button variant="ghost" size="icon-sm" className={ICON_PILL} onClick={share} aria-label="Share post">
          <AnimatePresence mode="wait" initial={false}>
            <m.span
              key={copied ? "done" : "share"}
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.4, opacity: 0 }}
              transition={{ duration: 0.14 }}
              className="grid place-items-center"
            >
              {copied ? <Check className="text-success-text size-5" /> : <Share2 className="size-5" />}
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
