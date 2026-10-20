// Realtime wiring for the engine: ONE channel per signed-in account for everything that changes messages, plus one
// private channel for the conversation currently open (typing indicators only).
//
// Why one account channel instead of one per conversation: Postgres changes are filtered per subscriber by row level
// security, so a single subscription to `messages` already delivers exactly the rows this member may read. Opening
// and closing conversations therefore costs no subscription churn at all (previously an inbox channel and a thread
// channel were both created on every open, and the inbox channel re-rendered the whole page on every event).
//
// Possession of a channel name is not authorisation: postgres_changes rows pass row level security, and the typing
// channel is `private`, which makes Realtime evaluate the policies on realtime.messages (migration 20260123000029:
// only the two members of that conversation may join).

export function createSupabaseRealtime({ userId, onInsert, onUpdate, onMember, onStatus, onTyping }) {
  let cancelled = false;
  let supabase = null;
  let channel = null;
  let typing = { id: null, channel: null };

  async function start() {
    try {
      const { getBrowserClient } = await import("@/lib/supabase/client");
      supabase = getBrowserClient();
      // The browser client restores its session asynchronously; joining before that finishes would subscribe as an
      // anonymous user and (correctly) receive nothing.
      const { data } = await supabase.auth.getSession();
      if (data.session?.access_token) supabase.realtime.setAuth(data.session.access_token);
      if (cancelled) return;
      onStatus("connecting");
      channel = supabase
        .channel(`chat:${userId}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (p) => onInsert(p.new))
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages" }, (p) => onUpdate(p.new))
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "conversation_members" }, (p) => onMember(p.new))
        .subscribe((status) => {
          if (cancelled) return;
          if (status === "SUBSCRIBED") onStatus("live");
          else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") onStatus("down");
        });
    } catch {
      onStatus("down");
    }
  }

  function stop() {
    cancelled = true;
    if (supabase && channel) supabase.removeChannel(channel);
    if (supabase && typing.channel) supabase.removeChannel(typing.channel);
    channel = null;
    typing = { id: null, channel: null };
  }

  /** Join the typing channel of the open conversation (or leave, with null). Failure just means no indicator. */
  function watchTyping(convId) {
    if (!supabase || typing.id === convId) return;
    if (typing.channel) supabase.removeChannel(typing.channel);
    typing = { id: convId, channel: null };
    if (!convId) return;
    const ch = supabase
      .channel(`typing:${convId}`, { config: { private: true, broadcast: { self: false } } })
      .on("broadcast", { event: "typing" }, ({ payload }) => onTyping(convId, payload?.userId))
      .subscribe();
    typing.channel = ch;
  }

  function sendTyping(convId) {
    if (typing.id !== convId || !typing.channel) return;
    typing.channel.send({ type: "broadcast", event: "typing", payload: { userId } });
  }

  return { start, stop, watchTyping, sendTyping };
}
