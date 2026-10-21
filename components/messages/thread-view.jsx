"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowLeft, BellOff, Loader2, MoreHorizontal, WifiOff } from "lucide-react";
import { Bell, MessageCircle } from "@/components/icons/lucide-compat";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { UserAvatar } from "@/components/user-avatar";
import { ReportDialog } from "@/components/posts/report-dialog";
import { Composer } from "@/components/messages/composer";
import { MessageRow } from "@/components/messages/message-row";
import { useConnection, useEngine, useThread } from "@/components/messages/messages-provider";
import { setMutedAction } from "@/lib/actions/messages";
import { dayKey } from "@/lib/chat/model";

const STICK_PX = 96; // "at the bottom" means within this many pixels of it
const GROUP_MS = 5 * 60 * 1000;

// Where each conversation was scrolled to when the member left it (this tab, this session).
const positions = new Map();

function Skeletons() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-3 p-4">
      {[["w-2/5", false], ["w-3/5", true], ["w-1/3", false], ["w-1/2", true], ["w-2/5", false]].map(([w, mine], i) => (
        <Skeleton key={i} className={`h-10 rounded-2xl ${w} ${mine ? "self-end" : ""}`} />
      ))}
    </div>
  );
}

/** One open conversation: header, scrolling message log, composer. */
export function ThreadView({ conversationId, viewerId, onBack }) {
  const engine = useEngine();
  const thread = useThread(conversationId);
  const connection = useConnection();
  const [reportId, setReportId] = useState(null);
  const [unseen, setUnseen] = useState(0);
  const scroller = useRef(null);
  const content = useRef(null);
  const stuck = useRef(true);
  const last = useRef({ id: null, first: null, lastKey: null, height: 0, count: 0 });

  // Open: show the device's copy, revalidate with the server, join the typing channel.
  useEffect(() => {
    engine.openThread(conversationId);
    return () => engine.closeThread(conversationId);
  }, [engine, conversationId]);

  const { messages, header } = thread;
  const person = header?.person;
  const firstName = (person?.full_name ?? "them").split(" ")[0];

  // ── Scrolling ─────────────────────────────────────────────────────────────
  const toBottom = useCallback((behavior = "auto") => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const prev = last.current;
    const firstKey = messages[0]?.key ?? null;
    const lastMessage = messages.at(-1) ?? null;
    const lastKey = lastMessage?.key ?? null;

    if (prev.id !== conversationId) {
      // Arriving in a conversation: where we left it, or the newest message.
      const saved = positions.get(conversationId);
      if (saved && !saved.stuck && messages.length > 0) el.scrollTop = saved.top;
      else el.scrollTop = el.scrollHeight;
      stuck.current = !saved || saved.stuck;
      setUnseen(0);
    } else if (messages.length > 0 && prev.count > 0) {
      const prepended = firstKey !== prev.first && lastKey === prev.lastKey;
      const appended = lastKey !== prev.lastKey;
      if (prepended) {
        // Older messages were added above: keep what the member was reading exactly where it was.
        el.scrollTop += el.scrollHeight - prev.height;
      } else if (appended) {
        const added = messages.length - prev.count;
        if (stuck.current || lastMessage?.sender_id === viewerId) {
          const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
          toBottom(lastMessage?.sender_id === viewerId || reduce ? "auto" : "smooth");
        } else if (added > 0 && lastMessage?.sender_id !== viewerId) {
          setUnseen((n) => n + added);
        }
      }
    } else if (prev.count === 0 && messages.length > 0) {
      // The first messages of this conversation arrived (no cache): show the newest.
      el.scrollTop = el.scrollHeight;
    }
    last.current = { id: conversationId, first: firstKey, lastKey, height: el.scrollHeight, count: messages.length };
  }, [messages, conversationId, viewerId, toBottom]);

  // Remember the position when leaving.
  useEffect(() => {
    const el = scroller.current;
    return () => {
      if (el) positions.set(conversationId, { top: el.scrollTop, stuck: stuck.current });
    };
  }, [conversationId]);

  // Content that grows after layout (an image finishing loading) must not push the member away from the bottom.
  useEffect(() => {
    const node = content.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (stuck.current) toBottom("auto");
      if (last.current.id === conversationId) last.current.height = scroller.current?.scrollHeight ?? last.current.height;
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, [conversationId, toBottom]);

  const onScroll = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_PX;
    stuck.current = atBottom;
    if (atBottom) setUnseen((n) => (n ? 0 : n));
  }, []);

  // Older history loads as the top comes into view (and via the button, for keyboard and screen reader users).
  const top = useRef(null);
  useEffect(() => {
    const el = top.current;
    const root = scroller.current;
    if (!el || !root || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && engine.loadOlder(conversationId), { root, rootMargin: "240px 0px 0px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [engine, conversationId, thread.hasMoreOlder, thread.status]);

  // ── Actions (stable identities, so rows can stay memoised) ────────────────
  const onDelete = useCallback(
    async (id) => {
      const res = await engine.deleteMessage(conversationId, id);
      if (!res.ok) toast.error(res.error ?? "Could not delete that message.");
    },
    [engine, conversationId],
  );
  const onRetry = useCallback((id) => engine.retry(id), [engine]);
  const onDiscard = useCallback((id) => engine.discard(id), [engine]);
  const onReport = useCallback((id) => setReportId(id), []);

  async function toggleMute() {
    const next = !header?.muted;
    engine.setMutedLocal(conversationId, next);
    const res = await setMutedAction({ conversationId, muted: next });
    if (!res.ok) {
      engine.setMutedLocal(conversationId, !next);
      toast.error(res.error);
    } else toast.success(next ? "Conversation muted" : "Notifications on");
  }

  // ── Derived display values ────────────────────────────────────────────────
  const lastMineId = useMemo(() => messages.findLast((m) => m.sender_id === viewerId && !m.send && m.status === "sent")?.id ?? null, [messages, viewerId]);
  const readAt = header?.otherLastReadAt ? new Date(header.otherLastReadAt).getTime() : 0;

  if (thread.notFound) {
    return (
      <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
        <MessageCircle className="size-8" aria-hidden="true" />
        <p className="text-foreground font-heading font-bold">This conversation is not available</p>
        <Button variant="outline" size="sm" onClick={onBack}>Back to messages</Button>
      </div>
    );
  }

  const loadingFirst = thread.status !== "ready" && messages.length === 0;
  const cannotSend = header?.canSend === false;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b px-3 py-2.5">
        <button type="button" onClick={onBack} className="text-muted-foreground hover:text-foreground -ml-1 grid size-9 place-items-center rounded-lg md:hidden" aria-label="Back to conversations">
          <ArrowLeft className="size-5" />
        </button>
        {person ? <UserAvatar name={person.full_name} avatarKey={person.avatar_key} size="sm" /> : <Skeleton className="size-8 rounded-full" />}
        <div className="min-w-0 flex-1 leading-tight">
          {person ? (
            person.username ? (
              <Link href={`/u/${person.username}`} className="block truncate text-sm font-semibold hover:underline">
                {person.full_name}
              </Link>
            ) : (
              <span className="block truncate text-sm font-semibold">{person.full_name}</span>
            )
          ) : (
            <Skeleton className="h-4 w-32" />
          )}
          <p className="text-muted-foreground h-4 truncate text-xs" aria-live="polite">
            {thread.typing ? "typing…" : person?.headline ?? ""}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Conversation options">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={toggleMute}>
              {header?.muted ? (
                <>
                  <Bell /> Turn notifications on
                </>
              ) : (
                <>
                  <BellOff /> Mute notifications
                </>
              )}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {(!connection.online || thread.error === "offline") && (
        <p role="status" className="bg-muted text-muted-foreground flex items-center gap-2 px-3 py-1.5 text-xs">
          <WifiOff className="size-3.5 shrink-0" aria-hidden="true" />
          {connection.online ? "Could not reach UniSphere. Showing saved messages." : "You are offline. Messages you write will send when you are back."}
        </p>
      )}
      {connection.authLost && (
        <p role="alert" className="bg-destructive/10 text-destructive px-3 py-1.5 text-xs">
          Your session ended. <a href="/login?next=/messages" className="font-semibold underline">Log in again</a> to send your waiting messages.
        </p>
      )}

      <div className="relative min-h-0 flex-1">
        <div ref={scroller} onScroll={onScroll} role="log" aria-label={`Conversation with ${person?.full_name ?? "this person"}`} className="h-full overflow-y-auto overscroll-contain px-3 py-3 [overflow-anchor:none] sm:px-4">
          <div ref={content}>
          {loadingFirst ? (
            <Skeletons />
          ) : thread.status === "error" && messages.length === 0 ? (
            <div className="text-muted-foreground p-6 text-center text-sm">
              <p>This conversation could not be loaded.</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => engine.openThread(conversationId)}>Try again</Button>
            </div>
          ) : (
            <>
              <div ref={top} aria-hidden="true" className="h-px" />
              {thread.hasMoreOlder && (
                <div className="mb-2 text-center">
                  <Button variant="ghost" size="xs" onClick={() => engine.loadOlder(conversationId)} disabled={thread.loadingOlder}>
                    {thread.loadingOlder && <Loader2 className="animate-spin" />} Load earlier messages
                  </Button>
                </div>
              )}
              {messages.length === 0 && thread.status === "ready" && <p className="text-muted-foreground py-10 text-center text-sm">Say hello to {firstName}.</p>}
              <ul>
                {messages.map((m, i) => {
                  const prev = messages[i - 1];
                  const mine = m.sender_id === viewerId;
                  const newDay = !prev || dayKey(prev.created_at) !== dayKey(m.created_at);
                  const grouped = Boolean(prev) && !newDay && prev.sender_id === m.sender_id && new Date(m.created_at) - new Date(prev.created_at) < GROUP_MS && !m.send === !prev.send;
                  return (
                    <MessageRow
                      key={m.key}
                      m={m}
                      mine={mine}
                      grouped={grouped}
                      newDay={newDay}
                      read={m.id === lastMineId && readAt >= new Date(m.created_at).getTime()}
                      onDelete={onDelete}
                      onReport={onReport}
                      onRetry={onRetry}
                      onDiscard={onDiscard}
                    />
                  );
                })}
              </ul>
            </>
          )}
          </div>
        </div>
        {unseen > 0 && (
          <Button
            type="button"
            size="sm"
            onClick={() => {
              toBottom("smooth");
              setUnseen(0);
            }}
            className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full shadow-md"
          >
            <ArrowDown /> {unseen} new message{unseen === 1 ? "" : "s"}
          </Button>
        )}
      </div>

      {cannotSend ? (
        <p className="text-muted-foreground border-t p-4 text-center text-sm">
          You can no longer send messages in this conversation. {firstName} may have changed who can message them, or one of you has blocked the other.
        </p>
      ) : (
        <Composer key={conversationId} conversationId={conversationId} firstName={firstName} />
      )}
      {reportId && <ReportDialog open onOpenChange={(o) => !o && setReportId(null)} targetType="message" targetId={reportId} />}
    </div>
  );
}
