"use client";

import { useEffect, useRef } from "react";
import { useRealtimeChannel } from "@/hooks/use-realtime-channel";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { BellOff } from "lucide-react";
import { UserAvatar } from "@/components/user-avatar";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Conversation sidebar; refreshes (debounced) whenever a message arrives anywhere. */
export function ConversationList({ conversations, userId }) {
  const params = useParams();
  const router = useRouter();
  const timer = useRef(null);

  useRealtimeChannel(`inbox:${userId}`, (channel) => {
    channel.on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 400);
    });
  });
  useEffect(() => () => clearTimeout(timer.current), []);

  if (conversations.length === 0) {
    return <p className="text-muted-foreground p-4 text-sm">No conversations yet. Open someone&rsquo;s profile and choose Message.</p>;
  }
  return (
    <ul aria-label="Conversations" className="divide-y">
      {conversations.map((c) => {
        const active = params?.conversationId === c.id;
        return (
          <li key={c.id}>
            <Link prefetch={false} href={`/messages/${c.id}`} aria-current={active ? "page" : undefined} className={cn("hover:bg-muted/60 flex items-center gap-3 p-3", active && "bg-accent/50")}>
              <UserAvatar name={c.person.full_name} avatarKey={c.person.avatar_key} size="md" />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className={cn("truncate text-sm", c.unread > 0 ? "font-bold" : "font-semibold")}>{c.person.full_name}</span>
                  <time dateTime={c.last_message_at} suppressHydrationWarning className="text-muted-foreground shrink-0 text-[11px]">{timeAgo(c.last_message_at)}</time>
                </span>
                <span className={cn("block truncate text-xs", c.unread > 0 ? "text-foreground" : "text-muted-foreground")}>{c.last_message_preview ?? "No messages yet"}</span>
              </span>
              {c.muted && <BellOff className="text-muted-foreground size-3.5" aria-label="Muted" />}
              {c.unread > 0 && (
                <span className="bg-primary text-primary-foreground min-w-5 rounded-full px-1.5 text-center text-[11px] leading-5 font-semibold">
                  {c.unread > 99 ? "99+" : c.unread}
                  <span className="sr-only"> unread</span>
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
