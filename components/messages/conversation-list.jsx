"use client";

import { memo, useDeferredValue, useMemo, useState } from "react";
import { BellOff, MessageCircle, Search } from "lucide-react";
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
          "hover:bg-muted/60 focus-visible:ring-ring flex items-center gap-3 px-3 py-2.5 outline-none focus-visible:ring-2 focus-visible:ring-inset",
          active && "bg-accent/60",
        )}
      >
        <UserAvatar name={c.person.full_name} avatarKey={c.person.avatar_key} size="md" className="shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className={cn("truncate text-sm", unread ? "font-bold" : "font-semibold")}>{c.person.full_name}</span>
            <time dateTime={c.last_message_at} suppressHydrationWarning className="text-muted-foreground shrink-0 text-[11px] tabular-nums">
              {timeAgo(c.last_message_at)}
            </time>
          </span>
          <span className="flex items-center gap-2">
            <span className={cn("block min-w-0 flex-1 truncate text-xs", unread ? "text-foreground font-medium" : "text-muted-foreground")}>
              {c.last_message_preview ?? "No messages yet"}
            </span>
            {c.muted && <BellOff className="text-muted-foreground size-3.5 shrink-0" aria-label="Muted" />}
            {unread && (
              <span className="bg-primary text-primary-foreground min-w-5 shrink-0 rounded-full px-1.5 text-center text-[11px] leading-5 font-semibold tabular-nums">
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
    <ul aria-hidden="true" className="space-y-1 p-3">
      {Array.from({ length: 6 }, (_, i) => (
        <li key={i} className="flex items-center gap-3 py-1.5">
          <Skeleton className="size-10 shrink-0 rounded-full" />
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
  const deferred = useDeferredValue(query);

  const items = useMemo(() => {
    const q = deferred.trim().toLowerCase();
    if (!q) return inbox.items;
    return inbox.items.filter((c) => `${c.person.full_name} ${c.person.username ?? ""} ${c.last_message_preview ?? ""}`.toLowerCase().includes(q));
  }, [inbox.items, deferred]);

  const showSkeleton = inbox.items.length === 0 && (inbox.status === "idle" || inbox.status === "loading" || !inbox.hydrated);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b p-3">
        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search conversations"
            aria-label="Search conversations"
            className="bg-muted/60 placeholder:text-muted-foreground focus-visible:ring-ring h-9 w-full rounded-lg border-0 pr-3 pl-9 text-sm outline-none focus-visible:ring-2"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
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
          <p className="text-muted-foreground p-4 text-sm">No conversations match &ldquo;{deferred}&rdquo;.</p>
        ) : (
          <ul aria-label="Conversations" className="divide-border/60 divide-y">
            {items.map((c) => (
              <Row key={c.id} c={c} active={c.id === activeId} onOpen={onOpen} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
