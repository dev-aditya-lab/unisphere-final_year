"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatedIcon } from "@/components/icons/animated-icon";
import { CountBadge } from "@/components/motion/count-badge";
import { Button } from "@/components/ui/button";
import { useRealtimeChannel } from "@/hooks/use-realtime-channel";
import { announceNotification } from "@/components/notifications/announce";

/** Bell with an unread badge that updates live when a notification arrives (Supabase Realtime, RLS-filtered), and a heads-up toast for it. */
export function NotificationBell({ userId, initialCount }) {
  const router = useRouter();
  const [count, setCount] = useState(initialCount);
  const [rings, setRings] = useState(0); // increments only for a live arrival, so the bell never rings on page load

  useRealtimeChannel(
    `notifications:${userId}`,
    (channel) => {
      channel.on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, (payload) => {
        if (payload.new?.type !== "message" && !payload.new?.read_at) {
          setCount((c) => c + 1);
          setRings((r) => r + 1);
        }
        if (!payload.new?.read_at) announceNotification(payload.new, (href) => router.push(href));
      });
    },
    { idle: true },
  );

  return (
    <Button asChild variant="ghost" size="icon" className="relative">
      <Link href="/notifications" aria-label={count > 0 ? `Notifications, ${count} unread` : "Notifications"}>
        {/* The bell rings once whenever the count goes up (a live notification arrived), never on page load. */}
        <AnimatedIcon name="bell" size={24} pulse={rings} />
        <CountBadge value={count} label="unread" max={9} className="pointer-events-none absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 text-[10px]" />
      </Link>
    </Button>
  );
}
