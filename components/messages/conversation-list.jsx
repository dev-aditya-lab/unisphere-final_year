"use client";

import { memo, useDeferredValue, useMemo, useState } from "react";
import { BellOff } from "lucide-react";
import { MessageCircle, Search } from "@/components/icons/lucide-compat";
import { UserAvatar } from "@/components/user-avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useEngine, useInbox } from "@/components/messages/messages-provider";

const Row = memo(function Row({ c, active, onOpen }) {
  const unread = c.unread > 0;
  return (
    <li>
      <a
        href={`/messages/${c.id}`}
        aria-current={active ? "page" : undefined}
        onClick={(e) => {
          // A plain click switches conversation without a server round trip; ctrl/cmd/middle click keeps its meaning.
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
          e.preventDefault();
          onOpen(c.id);
        }}
        className={cn(
          "hover:bg-muted/60 active:bg-muted focus-visible:ring-ring flex min-h-[4.5rem] items-center gap-3 px-4 py-2.5 outline-none focus-visible:ring-2 focus-visible:ring-inset",
          active && "bg-primary-soft/70 hover:bg-primary-soft/70",
        )}
      >
        <UserAvatar name={c.person.full_name} avatarKey={c.person.avatar_key} size="post" className="shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className={cn("truncate text-[0.9375rem]", unread ? "font-bold" : "font-semibold")}>{c.person.full_name}</span>
            <time dateTime={c.last_message_at} suppressHydrationWarning className={cn("shrink-0 text-xs tabular-nums", unread ? "text-primary-text font-semibold" : "text-muted-foreground")}>
              {timeAgo(c.last_message_at)}
            </time>
          </span>
          <span className="flex items-center gap-2">
            <span className={cn("block min-w-0 flex-1 truncate text-[0.8125rem]", unread ? "text-foreground font-medium" : "text-muted-foreground")}>
              {c.last_message_preview ?? "No messages yet"}
            </span>
            {c.muted && <BellOff className="text-muted-foreground size-3.5 shrink-0" aria-label="Muted" />}
            {unread && (
              <span className="bg-primary text-primary-foreground min-w-5 shrink-0 rounded-full px-1.5 text-center text-[11px] leading-5 font-bold tabular-nums">
                {c.unread > 99 ? "99+" : c.unread}
                <span className="sr-only"> unread</span>
              </span>
            )}
          </span>
        </span>
      </a>
    </li>
  );
});

function ListSkeleton() {
  return (
    <ul aria-hidden="true" className="space-y-1 px-4 py-2">
      {Array.from({ length: 6 }, (_, i) => (
        <li key={i} className="flex items-center gap-3 py-1.5">
          <Skeleton className="size-11 shrink-0 rounded-full" />
          <span className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/2" />
            <Skeleton className="h-3 w-4/5" />
          </span>
        </li>
      ))}
    </ul>
  );
}

/** The inbox. Reads straight from the engine: one row changes when one conversation changes. */
export function ConversationList({ activeId, onOpen }) {
  const engine = useEngine();
  const inbox = useInbox();
  const [query, setQuery] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const deferred = useDeferredValue(query);

  const items = useMemo(() => {
    const q = deferred.trim().toLowerCase();
    const base = unreadOnly ? inbox.items.filter((c) => c.unread > 0) : inbox.items;
    if (!q) return base;
    return base.filter((c) => `${c.person.full_name} ${c.person.username ?? ""} ${c.last_message_preview ?? ""}`.toLowerCase().includes(q));
  }, [inbox.items, deferred, unreadOnly]);
  const unreadCount = useMemo(() => inbox.items.filter((c) => c.unread > 0).length, [inbox.items]);

  const showSkeleton = inbox.items.length === 0 && (inbox.status === "idle" || inbox.status === "loading" || !inbox.hydrated);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 space-y-2.5 px-4 pt-4 pb-2">
        <h1 className="font-heading text-2xl font-extrabold">Messages</h1>
        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search conversations"
            aria-label="Search conversations"
            className="bg-muted placeholder:text-muted-foreground focus-visible:ring-ring h-11 w-full rounded-full border-0 pr-4 pl-10 text-base outline-none focus-visible:ring-2 md:h-10 md:text-sm"
          />
        </div>
        <div className="flex gap-2" role="group" aria-label="Filter conversations">
          {[
            { id: false, label: "All" },
            { id: true, label: unreadCount > 0 ? `Unread ${unreadCount}` : "Unread" },
          ].map((f) => (
            <button
              key={String(f.id)}
              type="button"
              aria-pressed={unreadOnly === f.id}
              onClick={() => setUnreadOnly(f.id)}
              className={cn(
                "h-8 rounded-full border px-3.5 text-[13px] font-semibold transition-colors",
                unreadOnly === f.id ? "border-primary-soft bg-primary-soft text-primary-text" : "text-muted-foreground hover:bg-muted",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {showSkeleton ? (
          <ListSkeleton />
        ) : inbox.status === "error" && inbox.items.length === 0 ? (
          <div className="p-4 text-sm">
            <p className="text-muted-foreground">Conversations could not be loaded.</p>
            <button type="button" onClick={() => engine.refreshInbox()} className="mt-2 font-semibold underline underline-offset-2">
              Try again
            </button>
          </div>
        ) : inbox.items.length === 0 ? (
          <div className="text-muted-foreground flex flex-col items-center gap-2 p-6 text-center text-sm">
            <MessageCircle className="size-6" aria-hidden="true" />
            <p>No conversations yet. Open someone&rsquo;s profile and choose Message.</p>
          </div>
        ) : items.length === 0 ? (
          <p className="text-muted-foreground p-6 text-center text-sm">{unreadOnly && !deferred ? "No unread conversations." : <>No conversations match &ldquo;{deferred}&rdquo;.</>}</p>
        ) : (
          <ul aria-label="Conversations">
            {items.map((c) => (
              <Row key={c.id} c={c} active={c.id === activeId} onOpen={onOpen} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
