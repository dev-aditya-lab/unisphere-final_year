"use client";

import { memo, useCallback, useEffect, useRef, useState, useTransition } from "react";
import { CircleAlert } from "@/components/icons/lucide-compat";
import { Button } from "@/components/ui/button";
import { BackToTop } from "@/components/posts/back-to-top";
import { PostCard } from "@/components/posts/post-card";
import { PostSkeleton } from "@/components/skeletons";
import { loadFeedAction } from "@/lib/actions/posts";
import { onPostChanged, onPostCreated } from "@/lib/client/feed-events";
import { forgetPost, readFeedCache, writeFeedCache } from "@/lib/client/feed-cache";

// Each card parses its text and builds its menus; without this every "load more" or delete re-ran all of them. The
// post objects are replaced only when they change, and `onDeleted` is stable, so unaffected cards skip rendering.
const FeedItem = memo(function FeedItem({ post, viewerId, onDeleted, onDismissed, canSummarize }) {
  // On a phone the feed is one flat column: each post runs edge to edge (the page gutter is 0.75rem), separated by a hairline.
  return <PostCard post={post} viewerId={viewerId} onDeleted={onDeleted} onDismissed={onDismissed} canSummarize={canSummarize} className="max-sm:-mx-3 max-sm:rounded-none max-sm:border-x-0 max-sm:border-t-0 max-sm:border-border max-sm:shadow-none" />;
});

/**
 * Cursor-paginated feed. The first page is rendered by the server; further pages load when the
 * sentinel scrolls into view (with a visible "Load more" button as the keyboard/no-JS-observer fallback).
 */
export function FeedList({ initialItems, initialCursor, scope, category, viewerId, empty, canSummarize = false }) {
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

  // Pages the member already scrolled through come back from this device when they return to the feed. Only when the
  // server's first page still starts with the same post (nothing new arrived or moved), and only the pages after it.
  const feedKey = `${scope}|${category ?? ""}`;
  const firstId = initialItems[0]?.id;
  const extraAfter = initialItems.length;
  useEffect(() => {
    if (!viewerId || !firstId) return;
    let live = true;
    readFeedCache(viewerId, feedKey).then((cached) => {
      if (!live || !cached || cached.items[0]?.id !== firstId || cached.items.length <= extraAfter) return;
      setItems((prev) => {
        if (prev.length > extraAfter) return prev; // the member already loaded more: keep what they have
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...cached.items.filter((p) => !seen.has(p.id))];
      });
      setCursor(cached.cursor);
    });
    return () => {
      live = false;
    };
  }, [viewerId, feedKey, firstId, extraAfter]);

  // Keep the on-device copy current while pages are loaded (debounced; nothing is written for the first page alone).
  useEffect(() => {
    if (!viewerId || items.length <= extraAfter) return;
    const t = setTimeout(() => writeFeedCache(viewerId, feedKey, { items, cursor }), 400);
    return () => clearTimeout(t);
  }, [viewerId, feedKey, items, cursor, extraAfter]);

  // A saved reaction or bookmark updates this list's copy of that post only.
  useEffect(() => onPostChanged((id, patch) => setItems((prev) => (prev.some((p) => p.id === id) ? prev.map((p) => (p.id === id ? { ...p, ...patch } : p)) : prev))), []);

  const removePost = useCallback(
    (id) => {
      setItems((prev) => prev.filter((p) => p.id !== id));
      if (viewerId) forgetPost(viewerId, id);
    },
    [viewerId],
  );

  // A post the member just wrote appears at the top at once; the server's refreshed copy replaces it later.
  useEffect(
    () =>
      onPostCreated((post) => {
        if (post.community_id) return false; // community posts belong to the community page, not the main feed
        if (scope === "public" && post.visibility !== "public") return false;
        if (scope === "for_you" && post.visibility === "private") return false;
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
      {items.length > 6 && <BackToTop />}
      <ul className="max-sm:divide-y-0 sm:space-y-4" aria-label="Posts">
        {items.map((post, i) => (
          <li key={post.id} className="feed-item" style={{ "--i": i < 6 ? i : 0 }}>
            <FeedItem post={post} viewerId={viewerId} onDeleted={removePost} onDismissed={scope === "for_you" ? removePost : undefined} canSummarize={canSummarize} />
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
