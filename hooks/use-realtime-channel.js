"use client";

import { useEffect, useRef } from "react";

/**
 * Subscribe to a Supabase Realtime channel as the signed-in member.
 *
 * The browser client restores its session asynchronously. Subscribing before that finishes joins the
 * channel as an anonymous user, and Row Level Security then (correctly) delivers nothing. So we load the
 * session and hand its access token to Realtime first, then subscribe.
 *
 * `configure(channel)` attaches the `.on(...)` handlers. It is read through a ref, so it may close over
 * fresh state without causing re-subscription. Returns a ref to the live channel (for broadcast sends).
 *
 * The Supabase browser client (about 65 KB gzipped) is imported on demand, so pages that only need a live badge do
 * not pay for it in the first bundle. `idle: true` also waits for the browser to be idle before connecting, for
 * channels that are not needed to read the page (the notification bell); a conversation connects at once.
 *
 * `onStatus(status)` (optional) hears the connection's own states: SUBSCRIBED, CHANNEL_ERROR, TIMED_OUT, CLOSED. A screen that must
 * not miss events uses it to ask the server what it missed after a SUBSCRIBED that follows a drop. It is read through a ref like
 * `configure`, so passing a new function never re-subscribes.
 */
export function useRealtimeChannel(name, configure, { idle = false, onStatus = null } = {}) {
  const channelRef = useRef(null);
  const configureRef = useRef(configure);
  const statusRef = useRef(onStatus);

  useEffect(() => {
    configureRef.current = configure;
    statusRef.current = onStatus;
  });

  useEffect(() => {
    let cancelled = false;
    let channel;
    let supabase;
    let idleHandle;
    const start = async () => {
      const { getBrowserClient } = await import("@/lib/supabase/client");
      if (cancelled) return;
      supabase = getBrowserClient();
      const { data } = await supabase.auth.getSession();
      if (data.session?.access_token) supabase.realtime.setAuth(data.session.access_token);
      if (cancelled) return;
      channel = supabase.channel(name, { config: { broadcast: { self: false } } });
      configureRef.current(channel);
      channel.subscribe((status) => statusRef.current?.(status));
      channelRef.current = channel;
    };
    if (idle && typeof window.requestIdleCallback === "function") idleHandle = window.requestIdleCallback(start, { timeout: 3000 });
    else if (idle) idleHandle = setTimeout(start, 1500);
    else start();
    return () => {
      cancelled = true;
      if (idleHandle !== undefined) {
        if (typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(idleHandle);
        clearTimeout(idleHandle);
      }
      if (channel && supabase) supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [name, idle]);

  return channelRef;
}
