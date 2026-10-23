"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useRealtimeChannel } from "@/hooks/use-realtime-channel";

const Ctx = createContext(null);

/**
 * One live connection per open community, shared by everything inside it.
 *
 * The sidebar needs to know about messages in every channel (for unread counts) and the open channel needs the messages in its own.
 * Instead of one subscription each, this provider holds a single Realtime subscription for the community and passes each event on to
 * whoever asked (`subscribe`). Row level security filters the events per member on the server: a channel you cannot read never
 * arrives. The subscription is removed when the member leaves the community or the page closes. When it comes back after a drop,
 * listeners hear a "reconnected" signal and ask the server what they missed (a cursor query, not a refetch of the history).
 *
 * Unread counts start from the server's numbers and move with the events; the open channel is counted as read.
 */
export function WorkspaceProvider({ community, viewerId, data, children }) {
  const router = useRouter();
  const listeners = useRef(new Set());
  const activeChannel = useRef(null);
  const wasLive = useRef(false);
  const refreshTimer = useRef(null);
  const [unread, setUnread] = useState(data.unread ?? {});
  const [connection, setConnection] = useState("connecting");

  const emit = useCallback((event) => {
    for (const fn of listeners.current) fn(event);
  }, []);

  const subscribe = useCallback((fn) => {
    listeners.current.add(fn);
    return () => listeners.current.delete(fn);
  }, []);

  const setActive = useCallback((channelId) => {
    activeChannel.current = channelId;
    if (channelId) setUnread((u) => (u[channelId] ? { ...u, [channelId]: { unread: 0, mentions: 0 } } : u));
  }, []);

  const clearUnread = useCallback((channelId) => setUnread((u) => (u[channelId]?.unread || u[channelId]?.mentions ? { ...u, [channelId]: { unread: 0, mentions: 0 } } : u)), []);

  // The sidebar's own structure comes from the server; when it changes elsewhere, fetch it again (once, however many events arrive).
  const refreshSoon = useCallback(() => {
    clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => router.refresh(), 400);
  }, [router]);
  useEffect(() => () => clearTimeout(refreshTimer.current), []);

  const onMessage = useCallback(
    (payload) => {
      const row = payload.new;
      if (!row?.channel_id) return;
      if (payload.eventType === "INSERT" && row.author_id !== viewerId && row.status === "sent") {
        const visible = typeof document === "undefined" || document.visibilityState === "visible";
        if (!(row.channel_id === activeChannel.current && visible)) {
          const mentioned = Array.isArray(row.mentions) && row.mentions.includes(viewerId);
          setUnread((u) => {
            const cur = u[row.channel_id] ?? { unread: 0, mentions: 0 };
            return { ...u, [row.channel_id]: { unread: Math.min(cur.unread + 1, 100), mentions: Math.min(cur.mentions + (mentioned ? 1 : 0), 100) } };
          });
        }
      }
      emit({ type: "message", eventType: payload.eventType, row });
    },
    [emit, viewerId],
  );

  const onStatus = useCallback(
    (status) => {
      if (status === "SUBSCRIBED") {
        setConnection("live");
        if (wasLive.current) emit({ type: "reconnected" });
        wasLive.current = true;
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        setConnection("offline");
      }
    },
    [emit],
  );

  useRealtimeChannel(
    `community:${community.id}`,
    (channel) => {
      channel
        .on("postgres_changes", { event: "*", schema: "public", table: "channel_messages", filter: `community_id=eq.${community.id}` }, onMessage)
        .on("postgres_changes", { event: "*", schema: "public", table: "community_channels", filter: `community_id=eq.${community.id}` }, refreshSoon)
        .on("postgres_changes", { event: "*", schema: "public", table: "community_categories", filter: `community_id=eq.${community.id}` }, refreshSoon);
    },
    { onStatus },
  );

  // Missed events while the device slept or the network was away: ask the listeners to catch up when the page is usable again.
  useEffect(() => {
    let last = 0;
    const wake = () => {
      if (document.visibilityState === "hidden" || Date.now() - last < 5000) return;
      last = Date.now();
      emit({ type: "reconnected" });
    };
    window.addEventListener("online", wake);
    document.addEventListener("visibilitychange", wake);
    return () => {
      window.removeEventListener("online", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [emit]);

  const value = useMemo(
    () => ({ community, viewerId, ...data, unread, connection, subscribe, setActive, clearUnread }),
    [community, viewerId, data, unread, connection, subscribe, setActive, clearUnread],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkspace() {
  const value = useContext(Ctx);
  if (!value) throw new Error("useWorkspace must be used inside a WorkspaceProvider");
  return value;
}
