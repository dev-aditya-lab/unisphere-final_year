"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";
import { loadNotificationsAction, markAllNotificationsReadAction, markNotificationReadAction } from "@/lib/actions/notifications";
import { describeNotification } from "@/lib/notification-text";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

export function NotificationList({ initialItems, initialCursor, category }) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(initialCursor);
  const [pending, startTransition] = useTransition();
  const unread = items.filter((n) => !n.read_at).length;

  function loadMore() {
    startTransition(async () => {
      const res = await loadNotificationsAction({ cursor, category });
      if (res.ok) {
        setItems((prev) => {
          const seen = new Set(prev.map((n) => n.id));
          return [...prev, ...res.items.filter((n) => !seen.has(n.id))];
        });
        setCursor(res.nextCursor);
      }
    });
  }

  function open(n) {
    if (!n.read_at) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
      markNotificationReadAction(n.id);
    }
  }

  function markAll() {
    // Optimistic: they read as read immediately; if the server refuses, the previous list comes back.
    const before = items;
    const now = new Date().toISOString();
    setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? now })));
    startTransition(async () => {
      const res = await markAllNotificationsReadAction(category);
      if (res.ok) router.refresh();
      else {
        setItems(before);
        toast.error(res.error ?? "Could not mark your notifications as read.");
      }
    });
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-muted-foreground text-sm" aria-live="polite">{unread > 0 ? `${unread} unread` : "All caught up"}</p>
        <Button variant="outline" size="sm" onClick={markAll} disabled={pending || unread === 0}>
          <CheckCheck /> Mark all as read
        </Button>
      </div>
      <ul className="surface-raised divide-y overflow-hidden" aria-label="Notifications">
        {items.map((n) => {
          const view = describeNotification(n, n.actor?.full_name);
          return (
            <li key={n.id} className={cn(!n.read_at && "bg-hot-soft/60")}>
              <Link href={view.href} onClick={() => open(n)} className="hover:bg-muted/60 flex items-start gap-3 p-4">
                {n.actor ? <UserAvatar name={n.actor.full_name} avatarKey={n.actor.avatar_key} size="sm" /> : <span className="bg-muted size-8 shrink-0 rounded-full" aria-hidden="true" />}
                <span className="min-w-0 flex-1">
                  <span className="block text-sm">{view.text}</span>
                  {view.detail && <span className="text-muted-foreground mt-0.5 line-clamp-2 block text-xs">{view.detail}</span>}
                  <time dateTime={n.created_at} suppressHydrationWarning className="text-muted-foreground mt-1 block text-xs">{timeAgo(n.created_at)}</time>
                </span>
                {!n.read_at && (
                  <>
                    <span className="bg-accent-hot mt-2 size-2 shrink-0 rounded-full" aria-hidden="true" />
                    <span className="sr-only">Unread</span>
                  </>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
      {cursor && (
        <div className="mt-4 text-center">
          <Button variant="outline" onClick={loadMore} disabled={pending}>
            {pending && <Loader2 className="animate-spin" />} Load more
          </Button>
        </div>
      )}
    </div>
  );
}
