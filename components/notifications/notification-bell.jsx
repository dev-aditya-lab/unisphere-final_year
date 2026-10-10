"use client";

import { useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRealtimeChannel } from "@/hooks/use-realtime-channel";

/** Bell with an unread badge that updates live when a notification arrives (Supabase Realtime, RLS-filtered). */
export function NotificationBell({ userId, initialCount }) {
  const [count, setCount] = useState(initialCount);

  useRealtimeChannel(`notifications:${userId}`, (channel) => {
    channel.on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, (payload) => {
      if (payload.new?.type !== "message" && !payload.new?.read_at) setCount((c) => c + 1);
    });
  });

  return (
    <Button asChild variant="ghost" size="icon" className="relative">
      <Link href="/notifications" aria-label={count > 0 ? `Notifications, ${count} unread` : "Notifications"}>
        <Bell />
        {count > 0 && (
          <span aria-hidden="true" className="bg-primary text-primary-foreground absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-4 font-semibold">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </Link>
    </Button>
  );
}
