"use client";

import { memo, useCallback, useEffect, useRef, useState, useTransition } from "react";
import { CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PostCard } from "@/components/posts/post-card";
import { PostSkeleton } from "@/components/skeletons";
import { loadFeedAction } from "@/lib/actions/posts";
import { onPostCreated } from "@/lib/client/feed-events";

// Each card parses its text and builds its menus; without this every "load more" or delete re-ran all of them. The
// post objects are replaced only when they change, and `onDeleted` is stable, so unaffected cards skip rendering.
const FeedItem = memo(function FeedItem({ post, viewerId, onDeleted }) {
  return <PostCard post={post} viewerId={viewerId} onDeleted={onDeleted} />;
});

/**
 * Cursor-paginated feed. The first page is rendered by the server; further pages load when the
 * sentinel scrolls into view (with a visible "Load more" button as the keyboard/no-JS-observer fallback).
 */
export function FeedList({ initialItems, initialCursor, scope, category, viewerId, empty }) {
  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(initialCursor);
  const [error, setError] = useState(null);
  const [pending, startTransition] = useTransition();
  const sentinel = useRef(null);
  const loading = useRef(false);

  const loadMore = useCallback(() => {
    if (!cursor || loading.current) return;
    loading.current = true;
    setError(null);
    startTransition(async () => {
      let res;
      try {
        res = await loadFeedAction({ scope, category: category ?? null, cursor });
      } catch {
        res = { ok: false, error: "We could not reach UniSphere. Check your connection and try again." };
      }
      loading.current = false;
      if (res.ok) {
        setItems((prev) => {
          const seen = new Set(prev.map((p) => p.id));
          return [...prev, ...res.items.filter((p) => !seen.has(p.id))];
        });
        setCursor(res.nextCursor);
      } else {
        setError(res.error ?? "Could not load more posts.");
      }
    });
  }, [cursor, scope, category]);

  const removePost = useCallback((id) => setItems((prev) => prev.filter((p) => p.id !== id)), []);

  // A post the member just wrote appears at the top at once; the server's refreshed copy replaces it later.
  useEffect(
    () =>
      onPostCreated((post) => {
        if (post.community_id) return false; // community posts belong to the community page, not the main feed
        if (scope === "public" && post.visibility !== "public") return false;
        if (scope === "college" && !post.college_id) return false;
        if (category && post.category !== category) return false;
        setItems((prev) => (prev.some((p) => p.id === post.id) ? prev : [post, ...prev]));
        return true;
      }),
    [scope, category],
  );

  // Stop trying after a failure: the observer would otherwise fire again at once, so the member's "Try again" is the retry.
  const observing = Boolean(cursor) && !error;
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !observing || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && loadMore(), { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, [observing, loadMore]);

  if (items.length === 0) return empty;

  return (
    <div>
      <ul className="-mx-3 sm:mx-0 sm:space-y-4 max-sm:[&>li+li]:-mt-px" aria-label="Posts">
        {items.map((post) => (
          <li key={post.id}>
            <FeedItem post={post} viewerId={viewerId} onDeleted={removePost} />
          </li>
        ))}
      </ul>
      <div ref={sentinel} className="flex min-h-16 flex-col items-center justify-center gap-3 py-6">
        {pending && (
          <div role="status" aria-label="Loading more posts" className="w-full">
            <PostSkeleton />
          </div>
        )}
        {cursor ? (
          error ? (
            <div role="alert" className="flex flex-col items-center gap-2 text-center">
              <p className="text-destructive-text flex items-center gap-1.5 text-sm">
                <CircleAlert className="size-4 shrink-0" aria-hidden="true" />
                {error}
              </p>
              <Button variant="outline" size="sm" onClick={loadMore} disabled={pending}>
                Try again
              </Button>
            </div>
          ) : (
            !pending && (
              <Button variant="outline" size="sm" onClick={loadMore}>
                Load more
              </Button>
            )
          )
        ) : (
          <p className="text-muted-foreground text-sm">You are all caught up.</p>
        )}
      </div>
    </div>
  );
}
