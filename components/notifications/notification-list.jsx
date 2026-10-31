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

const DAY = 86_400_000;
/** Today, Yesterday, This week, Earlier: how long ago a notification came, in whole days. */
function bucketOf(iso, now) {
  const start = new Date(now).setHours(0, 0, 0, 0);
  const t = new Date(iso).getTime();
  if (t >= start) return "Today";
  if (t >= start - DAY) return "Yesterday";
  if (t >= start - 6 * DAY) return "This week";
  return "Earlier";
}

export function NotificationList({ initialItems, initialCursor, category }) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(initialCursor);
  const [pending, startTransition] = useTransition();
  const unread = items.filter((n) => !n.read_at).length;
  const [now] = useState(() => Date.now());
  const groups = [];
  for (const n of items) {
    const label = bucketOf(n.created_at, now);
    const last = groups.at(-1);
    if (last?.label === label) last.items.push(n);
    else groups.push({ label, items: [n] });
  }

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
      {groups.map((g) => (
        <section key={g.label} aria-label={g.label} className="mb-4">
          <h2 className="eyebrow mb-1.5 px-1">{g.label}</h2>
          <ul className="surface-raised divide-y overflow-hidden">
            {g.items.map((n) => {
              const view = describeNotification(n, n.actor?.full_name);
              return (
                <li key={n.id} className={cn(!n.read_at && "bg-hot-soft/60")}>
                  <Link href={view.href} onClick={() => open(n)} className="hover:bg-muted/60 active:bg-muted flex min-h-[4.5rem] items-start gap-3 p-4">
                    {n.actor ? <UserAvatar name={n.actor.full_name} avatarKey={n.actor.avatar_key} size="md" /> : <span className="bg-muted size-10 shrink-0 rounded-full" aria-hidden="true" />}
                    <span className="min-w-0 flex-1">
                      <span className={cn("block text-sm", !n.read_at && "font-semibold")}>{view.text}</span>
                      {view.detail && <span className="text-muted-foreground mt-0.5 line-clamp-2 block text-[0.8125rem]">{view.detail}</span>}
                      <time dateTime={n.created_at} suppressHydrationWarning className="text-muted-foreground mt-1 block text-xs">{timeAgo(n.created_at)}</time>
                    </span>
                    {!n.read_at && (
                      <>
                        <span className="bg-primary mt-2 size-2.5 shrink-0 rounded-full" aria-hidden="true" />
                        <span className="sr-only">Unread</span>
                      </>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
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
