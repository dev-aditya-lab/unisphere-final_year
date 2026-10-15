"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PostCard } from "@/components/posts/post-card";
import { loadFeedAction } from "@/lib/actions/posts";
import { onPostCreated } from "@/lib/client/feed-events";

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
      const res = await loadFeedAction({ scope, category: category ?? null, cursor });
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

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !cursor || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && loadMore(), { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, [cursor, loadMore]);

  if (items.length === 0) return empty;

  return (
    <div>
      <ul className="space-y-4" aria-label="Posts">
        {items.map((post) => (
          <li key={post.id}>
            <PostCard post={post} viewerId={viewerId} onDeleted={(id) => setItems((prev) => prev.filter((p) => p.id !== id))} />
          </li>
        ))}
      </ul>
      <div ref={sentinel} className="flex min-h-16 items-center justify-center py-6">
        {cursor ? (
          <div className="flex flex-col items-center gap-2">
            {error && (
              <p role="alert" className="text-destructive-text text-sm">
                {error}
              </p>
            )}
            <Button variant="outline" size="sm" onClick={loadMore} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              {pending ? "Loading…" : error ? "Try again" : "Load more"}
            </Button>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">You are all caught up.</p>
        )}
      </div>
    </div>
  );
}
