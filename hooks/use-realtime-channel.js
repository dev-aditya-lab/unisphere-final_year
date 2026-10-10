"use client";

import { useEffect, useRef } from "react";
import { getBrowserClient } from "@/lib/supabase/client";

/**
 * Subscribe to a Supabase Realtime channel as the signed-in member.
 *
 * The browser client restores its session asynchronously. Subscribing before that finishes joins the
 * channel as an anonymous user, and Row Level Security then (correctly) delivers nothing. So we load the
 * session and hand its access token to Realtime first, then subscribe.
 *
 * `configure(channel)` attaches the `.on(...)` handlers. It is read through a ref, so it may close over
 * fresh state without causing re-subscription. Returns a ref to the live channel (for broadcast sends).
 */
export function useRealtimeChannel(name, configure) {
  const channelRef = useRef(null);
  const configureRef = useRef(configure);

  useEffect(() => {
    configureRef.current = configure;
  });

  useEffect(() => {
    const supabase = getBrowserClient();
    let cancelled = false;
    let channel;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session?.access_token) supabase.realtime.setAuth(data.session.access_token);
      if (cancelled) return;
      channel = supabase.channel(name, { config: { broadcast: { self: false } } });
      configureRef.current(channel);
      channel.subscribe();
      channelRef.current = channel;
    })();
    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [name]);

  return channelRef;
}
