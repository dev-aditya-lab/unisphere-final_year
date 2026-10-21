"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Flag, Heart, MoreHorizontal, Pencil, Reply, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SuggestTextarea } from "@/components/posts/suggest-textarea";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AuthorLine } from "@/components/posts/author-line";
import { RichText } from "@/components/posts/rich-text";
import { ReportDialog } from "@/components/posts/report-dialog";
import { UserAvatar } from "@/components/user-avatar";
import { addCommentAction, deleteCommentAction, editCommentAction, setCommentLikeAction } from "@/lib/actions/posts";
import { createOpTracker } from "@/lib/client/op-id";
import { cn } from "@/lib/utils";

function CommentForm({ postId, parentId = null, viewer, onAdded, onCancel, autoFocus = false, placeholder = "Write a comment…" }) {
  const [body, setBody] = useState("");
  const [error, setError] = useState(null);
  const [pending, startTransition] = useTransition();
  const [op] = useState(createOpTracker);

  function submit(e) {
    e.preventDefault();
    setError(null);
    // Same text, same key: pressing the button again after a lost response returns the saved comment, not a second one.
    const clientOpId = op.keyFor(JSON.stringify([postId, parentId, body]));
    startTransition(async () => {
      let res;
      try {
        res = await addCommentAction({ postId, parentId, body, clientOpId });
      } catch {
        setError("We could not reach UniSphere. Your comment is still here: try again.");
        return;
      }
      if (res.ok) {
        setBody("");
        op.reset();
        onAdded(res.comment);
        onCancel?.();
      } else setError(res.fieldErrors?.body ?? res.error);
    });
  }

  return (
    <form onSubmit={submit} className="flex gap-2.5">
      <UserAvatar name={viewer.full_name} avatarKey={viewer.avatar_key} size="sm" className="mt-1 shrink-0" />
      <div className="min-w-0 flex-1 space-y-2">
        <label htmlFor={`comment-${parentId ?? "root"}`} className="sr-only">
          {parentId ? "Write a reply" : "Write a comment"}
        </label>
        <SuggestTextarea
          id={`comment-${parentId ?? "root"}`}
          hashtags={false}
          rows={parentId ? 2 : 3}
          maxLength={2000}
          value={body}
          autoFocus={autoFocus}
          onChange={setBody}
          placeholder={placeholder}
          aria-invalid={Boolean(error)}
        />
        {error && (
          <p role="alert" className="text-destructive-text text-xs font-medium">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          {onCancel && (
            <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button type="submit" size="sm" disabled={pending || !body.trim()}>
            {pending ? "Posting…" : parentId ? "Reply" : "Comment"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function CommentItem({ comment, replies, viewer, postId, depth, onAdded, onChanged }) {
  const [replying, setReplying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(comment.body);
  const [reportOpen, setReportOpen] = useState(false);
  const [liked, setLiked] = useState(comment.liked);
  const [likes, setLikes] = useState(comment.like_count);
  const [pending, startTransition] = useTransition();
  const isOwner = viewer?.id === comment.author_id;
  const gone = comment.status !== "published";

  function toggleLike() {
    if (!viewer) return;
    const prev = { liked, likes };
    setLiked(!liked);
    setLikes(likes + (liked ? -1 : 1));
    startTransition(async () => {
      const res = await setCommentLikeAction({ commentId: comment.id, liked: !prev.liked });
      if (res.ok) setLikes(res.likeCount);
      else {
        setLiked(prev.liked);
        setLikes(prev.likes);
        toast.error(res.error);
      }
    });
  }

  function saveEdit() {
    startTransition(async () => {
      const res = await editCommentAction({ commentId: comment.id, body: editText });
      if (res.ok) {
        onChanged(comment.id, { body: editText.trim(), edited_at: new Date().toISOString() });
        setEditing(false);
      } else toast.error(res.fieldErrors?.body ?? res.error);
    });
  }

  function remove() {
    startTransition(async () => {
      const res = await deleteCommentAction(comment.id);
      if (res.ok) onChanged(comment.id, { status: "deleted", body: "" });
      else toast.error(res.error);
    });
  }

  return (
    <li className={cn(depth > 0 && "border-border ml-4 border-l pl-4 sm:ml-8")}>
      <div className="py-3">
        {gone ? (
          <p className="text-muted-foreground text-sm italic">{comment.status === "removed" ? "This comment was removed by a moderator." : "This comment was deleted."}</p>
        ) : (
          <>
            <div className="flex items-start justify-between gap-2">
              <AuthorLine
                name={comment.author_name}
                username={comment.author_username}
                avatarKey={comment.author_avatar_key}
                blueTick={comment.author_blue_tick}
                accountType={comment.author_account_type}
                createdAt={comment.created_at}
                edited={Boolean(comment.edited_at)}
                size="sm"
              />
              {viewer && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label="Comment actions">
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {isOwner ? (
                      <>
                        <DropdownMenuItem onSelect={() => setEditing(true)}>
                          <Pencil /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem variant="destructive" onSelect={remove}>
                          <Trash2 /> Delete
                        </DropdownMenuItem>
                      </>
                    ) : (
                      <DropdownMenuItem onSelect={() => setReportOpen(true)}>
                        <Flag /> Report
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>

            {editing ? (
              <div className="mt-2 space-y-2">
                <label htmlFor={`edit-${comment.id}`} className="sr-only">
                  Edit comment
                </label>
                <SuggestTextarea id={`edit-${comment.id}`} hashtags={false} rows={3} maxLength={2000} value={editText} onChange={setEditText} />
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                  <Button size="sm" disabled={pending || !editText.trim()} onClick={saveEdit}>
                    Save
                  </Button>
                </div>
              </div>
            ) : (
              <RichText text={comment.body} className="mt-2 text-[15px] leading-relaxed" />
            )}

            <div className="mt-1.5 flex items-center gap-1">
              {viewer ? (
                <Button variant="ghost" size="sm" className={cn("text-muted-foreground h-7 gap-1 px-2 text-xs", liked && "text-primary")} onClick={toggleLike} aria-pressed={liked} aria-label={liked ? "Unlike comment" : "Like comment"}>
                  <Heart className={cn("size-3.5", liked && "fill-current")} />
                  {likes > 0 && <span className="tabular-nums">{likes}</span>}
                </Button>
              ) : (
                likes > 0 && (
                  <span className="text-muted-foreground flex items-center gap-1 px-2 text-xs">
                    <Heart className="size-3.5" aria-hidden="true" /> {likes}
                  </span>
                )
              )}
              {viewer && depth === 0 && (
                <Button variant="ghost" size="sm" className="text-muted-foreground h-7 gap-1 px-2 text-xs" onClick={() => setReplying((v) => !v)}>
                  <Reply className="size-3.5" /> Reply
                </Button>
              )}
            </div>
          </>
        )}

        {replying && viewer && (
          <div className="mt-3">
            <CommentForm postId={postId} parentId={comment.id} viewer={viewer} autoFocus onCancel={() => setReplying(false)} onAdded={onAdded} placeholder={`Reply to ${comment.author_name}…`} />
          </div>
        )}
      </div>

      {replies.length > 0 && (
        <ul>
          {replies.map((r) => (
            <CommentItem key={r.id} comment={r} replies={[]} viewer={viewer} postId={postId} depth={1} onAdded={onAdded} onChanged={onChanged} />
          ))}
        </ul>
      )}
      {viewer && !isOwner && <ReportDialog open={reportOpen} onOpenChange={setReportOpen} targetType="comment" targetId={comment.id} />}
    </li>
  );
}

/** Threaded comments (one level of replies). `viewer` is the signed-in profile, or null for visitors. */
export function CommentsSection({ postId, initialComments, viewer }) {
  const [comments, setComments] = useState(initialComments);

  const { roots, repliesByParent } = useMemo(() => {
    const byParent = new Map();
    const top = [];
    for (const c of comments) {
      if (c.parent_id) byParent.set(c.parent_id, [...(byParent.get(c.parent_id) ?? []), c]);
      else top.push(c);
    }
    return { roots: top, repliesByParent: byParent };
  }, [comments]);

  const visibleCount = comments.filter((c) => c.status === "published").length;

  return (
    <section id="comments" aria-labelledby="comments-title" className="scroll-mt-24">
      <h2 id="comments-title" className="text-lg font-bold">
        Comments <span className="text-muted-foreground font-normal">({visibleCount})</span>
      </h2>

      <div className="mt-4">
        {viewer ? (
          <CommentForm postId={postId} viewer={viewer} onAdded={(c) => c && setComments((prev) => [...prev, c])} />
        ) : (
          <p className="text-muted-foreground text-sm">
            <Link href="/login" className="text-blue-text font-semibold hover:underline">
              Log in
            </Link>{" "}
            to join the conversation.
          </p>
        )}
      </div>

      {roots.length === 0 ? (
        <p className="text-muted-foreground mt-6 text-sm">No comments yet. Be the first to share a thought.</p>
      ) : (
        <ul className="divide-border mt-4 divide-y">
          {roots.map((c) => (
            <CommentItem
              key={c.id}
              comment={c}
              replies={repliesByParent.get(c.id) ?? []}
              viewer={viewer}
              postId={postId}
              depth={0}
              onAdded={(n) => n && setComments((prev) => [...prev, n])}
              onChanged={(id, patch) => setComments((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)))}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
