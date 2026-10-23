"use client";

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowDown, Bell, BellOff, ChevronLeft, Loader2, Pin, Search, WifiOff } from "lucide-react";
import { Settings, Sparkles } from "@/components/icons/lucide-compat";
import { toast } from "sonner";
import { ChannelComposer } from "@/components/community/channel-composer";
import { ChannelIcon } from "@/components/community/channel-icon";
import { CommunityReportDialog, RemoveMessageDialog } from "@/components/community/dialogs";
import { MessageItem, dayLabel } from "@/components/community/message-item";
import { ActionMenu } from "@/components/community/action-menu";
import { useChannel } from "@/components/community/use-channel";
import { useWorkspace } from "@/components/community/workspace-provider";
import { ChatMarkdown } from "@/components/posts/chat-markdown";
import { UserAvatar } from "@/components/user-avatar";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { setNotifyPrefAction, summarizeChannelAction } from "@/lib/actions/community-workspace";
import { MUTE_OPTIONS, NOTIFY_LEVELS, roleAtLeast } from "@/lib/community/rules";
import { cn } from "@/lib/utils";

const NEAR_BOTTOM = 96;
const GROUP_MS = 5 * 60 * 1000;
const reduceMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function notifyState(channelId, prefs) {
  const row = prefs.find((p) => p.channel_id === channelId) ?? prefs.find((p) => !p.channel_id) ?? null;
  const muted = row?.muted_until && new Date(row.muted_until) > new Date();
  return { level: row?.level ?? "mentions", muted: Boolean(muted) };
}

function NotificationMenu({ communityId, channel, prefs }) {
  const [pending, startTransition] = useTransition();
  const [local, setLocal] = useState(null);
  const state = local ?? notifyState(channel.id, prefs);
  const apply = (level, muteHours = null, done) =>
    startTransition(async () => {
      const res = await setNotifyPrefAction({ communityId, channelId: channel.id, level, muteHours });
      if (res.ok) {
        setLocal({ level, muted: Boolean(muteHours) || level === "none" });
        toast.success(done);
      } else toast.error(res.error);
    });
  const items = [
    ...NOTIFY_LEVELS.map((l) => ({ id: `lvl-${l.value}`, label: `${l.label}${state.level === l.value && !state.muted ? " ✓" : ""}`, onSelect: () => apply(l.value, null, `Notifications: ${l.label.toLowerCase()}`) })),
    ...MUTE_OPTIONS.map((o, i) => ({ id: `mute-${o.hours}`, label: `Mute ${o.label.toLowerCase()}`, onSelect: () => apply("none", o.hours, `Muted ${o.label.toLowerCase()}`), separatorBefore: i === 0 })),
  ];
  const off = state.muted || state.level === "none";
  return (
    <ActionMenu
      title="Notifications for this channel"
      description="Mentions and replies are the default. Announcements follow the same setting."
      items={items}
      trigger={
        <Button variant="ghost" size="icon-sm" disabled={pending} aria-label={off ? "Notifications are off for this channel" : "Notification settings for this channel"}>
          {off ? <BellOff /> : <Bell />}
        </Button>
      }
    />
  );
}

function PinsSheet({ open, onOpenChange, channelId }) {
  const [state, setState] = useState({ loading: true, items: [], people: {}, error: false });
  useEffect(() => {
    if (!open) return;
    let live = true;
    fetch(`/api/community-channels/${channelId}/pins`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => live && setState({ loading: false, items: j.items ?? [], people: j.people ?? {}, error: !j.ok }))
      .catch(() => live && setState({ loading: false, items: [], people: {}, error: true }));
    return () => {
      live = false;
    };
  }, [open, channelId]);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Pinned messages</SheetTitle>
          <SheetDescription>Important messages the moderators want everyone to find.</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-6">
          {state.loading && <Skeleton className="h-24 w-full" />}
          {state.error && <p role="alert" className="text-destructive-text text-sm">Pinned messages could not be loaded.</p>}
          {!state.loading && !state.error && state.items.length === 0 && <p className="text-muted-foreground text-sm">Nothing is pinned yet.</p>}
          <ul className="space-y-3">
            {state.items.map((m) => (
              <li key={m.id} className="rounded-lg border p-3">
                <p className="mb-1 flex items-center gap-2 text-xs">
                  <UserAvatar name={state.people[m.author_id]?.full_name} avatarKey={state.people[m.author_id]?.avatar_key} size="xs" />
                  <strong>{state.people[m.author_id]?.full_name ?? "UniSphere member"}</strong>
                  <time className="text-muted-foreground" dateTime={m.created_at} suppressHydrationWarning>{dayLabel(m.created_at)}</time>
                </p>
                <ChatMarkdown text={m.body} />
                {m.attachments?.length > 0 && <p className="text-muted-foreground mt-1 text-xs">{m.attachments.length} file{m.attachments.length === 1 ? "" : "s"} attached</p>}
              </li>
            ))}
          </ul>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function SearchSheet({ open, onOpenChange, communityId, channelId, slug, onJump }) {
  const [q, setQ] = useState("");
  const [state, setState] = useState({ loading: false, results: [], people: {}, error: null, asked: "" });
  const searching = q.trim().length >= 2;
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const controller = new AbortController();
    const t = setTimeout(async () => {
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const res = await fetch(`/api/communities/${communityId}/search?q=${encodeURIComponent(term)}`, { signal: controller.signal, cache: "no-store" });
        const json = await res.json();
        setState({ loading: false, results: json.ok ? json.results : [], people: json.people ?? {}, error: json.ok ? null : json.error, asked: term });
      } catch (e) {
        if (e.name !== "AbortError") setState((s) => ({ ...s, loading: false, error: "Search is unavailable right now." }));
      }
    }, 300);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [q, communityId]);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Search messages</SheetTitle>
          <SheetDescription>Searches the channels you can read in this community.</SheetDescription>
        </SheetHeader>
        <div className="space-y-3 px-4 pb-6">
          <Input autoFocus type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search for words…" aria-label="Search messages" maxLength={100} />
          {searching && state.loading && <Skeleton className="h-16 w-full" />}
          {searching && state.error && <p role="alert" className="text-destructive-text text-sm">{state.error}</p>}
          {searching && !state.loading && !state.error && state.asked && state.results.length === 0 && <p className="text-muted-foreground text-sm">Nothing found for “{state.asked}”.</p>}
          <ul className="space-y-2">
            {(searching ? state.results : []).map((r) => (
              <li key={r.id}>
                <Link
                  href={`/communities/${slug}/channels/${r.channel_id}?m=${r.id}`}
                  onClick={() => { onOpenChange(false); if (r.channel_id === channelId) onJump(r.id); }}
                  className="hover:bg-muted block rounded-lg border p-3"
                >
                  <span className="text-muted-foreground mb-1 flex items-center gap-2 text-xs">
                    <strong className="text-foreground">{state.people[r.author_id]?.full_name ?? "UniSphere member"}</strong>
                    in #{r.channel_name}
                    <time dateTime={r.created_at} suppressHydrationWarning>{dayLabel(r.created_at)}</time>
                  </span>
                  <span className="line-clamp-3 block text-sm"><ChatMarkdown text={r.body} /></span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function SummarySheet({ open, onOpenChange, channelId }) {
  const [state, setState] = useState({ status: "idle", data: null, error: null });
  const [pending, startTransition] = useTransition();
  function run() {
    setState({ status: "loading", data: null, error: null });
    startTransition(async () => {
      const res = await summarizeChannelAction(channelId);
      setState(res.ok ? { status: "done", data: res, error: null } : { status: "error", data: null, error: res.error ?? "A summary is not available right now." });
    });
  }
  const d = state.data?.summary;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Catch up with AI</SheetTitle>
          <SheetDescription>A short summary of the recent messages in this channel. It can be wrong, so check anything important in the channel itself.</SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4 pb-6">
          {state.status === "idle" && (
            <>
              <p className="text-muted-foreground text-xs">The recent messages (without names) are sent to our AI provider to write the summary. Only channels open to every member of a public community can be summarised. Nothing is kept.</p>
              <Button onClick={run}><Sparkles /> Summarise recent messages</Button>
            </>
          )}
          {(state.status === "loading" || pending) && <div className="space-y-2" aria-busy="true"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-5/6" /><Skeleton className="h-4 w-2/3" /></div>}
          {state.status === "error" && (
            <div role="alert" className="space-y-2">
              <p className="text-destructive-text text-sm">{state.error}</p>
              <Button variant="outline" size="sm" onClick={run}>Try again</Button>
            </div>
          )}
          {state.status === "done" && d && (
            <div className="space-y-4 text-sm" aria-live="polite">
              <p className="bg-primary-soft rounded-lg p-3">{d.summary}</p>
              {d.topics.length > 0 && <div><h3 className="mb-1 text-xs font-bold tracking-wide uppercase">Topics</h3><p>{d.topics.join(" · ")}</p></div>}
              {d.decisions.length > 0 && <div><h3 className="mb-1 text-xs font-bold tracking-wide uppercase">Decided</h3><ul className="list-disc space-y-1 pl-5">{d.decisions.map((x) => <li key={x}>{x}</li>)}</ul></div>}
              {d.openQuestions.length > 0 && <div><h3 className="mb-1 text-xs font-bold tracking-wide uppercase">Still open</h3><ul className="list-disc space-y-1 pl-5">{d.openQuestions.map((x) => <li key={x}>{x}</li>)}</ul></div>}
              <p className="text-muted-foreground text-xs">AI-generated from the last {state.data.basedOn} messages{state.data.cached ? " (reused from a minute ago)" : ""}.</p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/**
 * One open channel: header, messages, composer. Messages come from the server first (so the page is useful at once), then move with
 * the community's single live connection. Scrolling follows new messages only when you are at the bottom, tells you when you are not
 * ("N new messages"), and keeps your place exactly when earlier messages are loaded above you.
 */
export function ChannelView({ channel, seed, slug, aiAvailable = false }) {
  const { community, viewerId, me, prefs, connection, setActive } = useWorkspace();
  const chan = useChannel({ channelId: channel.id, seed });
  const params = useSearchParams();
  const wantedMessage = params.get("m");
  const scroller = useRef(null);
  const atBottom = useRef(true);
  const prevTop = useRef(null); // { firstId, lastId, height, top } before the last change
  const [initialIds] = useState(() => new Set(seed.items.map((m) => m.id)));
  const [seenId, setSeenId] = useState(() => seed.items.at(-1)?.id ?? null); // the newest message the reader has been at the bottom for
  const [highlight, setHighlight] = useState(wantedMessage);
  const [replyTo, setReplyTo] = useState(null);
  const [postState, setPostState] = useState(channel.postState);
  const [pins, setPins] = useState(false);
  const [summary, setSummary] = useState(false);
  const [search, setSearch] = useState(false);
  const [reporting, setReporting] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const role = me?.role ?? "member";
  const can = useMemo(
    () => ({ post: postState === "ok", edit: true, deleteOwn: true, pin: roleAtLeast(role, "moderator") && channel.postState !== "archived", moderate: roleAtLeast(role, "moderator") }),
    [postState, role, channel.postState],
  );
  const manager = roleAtLeast(role, "admin");

  useEffect(() => {
    setActive(channel.id);
    return () => setActive(null);
  }, [channel.id, setActive]);

  // ── the list as displayed: confirmed messages, then the ones still being sent ──
  const pendingMessages = useMemo(
    () =>
      chan.pending.map((p) => ({
        id: p.opId, channel_id: channel.id, author_id: viewerId, body: p.body, reply_to_id: p.replyTo, status: "sent", pinned_at: null, edited_at: null,
        created_at: new Date(p.created).toISOString(), client_op_id: p.opId, mentions: [],
        attachments: p.files.map((f) => ({ id: f.id, original_name: f.name, mime_type: f.mime, size: null, width: null, height: null })),
      })),
    [chan.pending, channel.id, viewerId],
  );
  const pendingByMessageId = useMemo(() => new Map(chan.pending.map((p) => [p.opId, p])), [chan.pending]);
  const all = useMemo(() => [...chan.messages, ...pendingMessages], [chan.messages, pendingMessages]);

  // How many messages arrived below the reader while they were reading higher up. Derived, so nothing has to be kept in step.
  const seenIndex = all.findIndex((m) => m.id === seenId);
  const newCount = seenIndex === -1 ? 0 : all.length - 1 - seenIndex;

  // ── scrolling ──
  const scrollToBottom = useCallback((smooth = false) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth && !reduceMotion() ? "smooth" : "auto" });
  }, []);

  const scrollToMessage = useCallback((id) => {
    const el = document.getElementById(`msg-${id}`);
    if (!el) return false;
    el.scrollIntoView({ block: "center", behavior: reduceMotion() ? "auto" : "smooth" });
    return true;
  }, []);

  const jumpTo = useCallback((id) => {
    if (!scrollToMessage(id)) return false;
    setHighlight(id);
    setTimeout(() => setHighlight((h) => (h === id ? null : h)), 2500);
    return true;
  }, [scrollToMessage]);

  // the message a link named stays highlighted for a moment
  useEffect(() => {
    if (!wantedMessage) return;
    const t = setTimeout(() => setHighlight((h) => (h === wantedMessage ? null : h)), 2500);
    return () => clearTimeout(t);
  }, [wantedMessage]);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const first = all[0]?.id ?? null;
    const last = all.at(-1);
    const before = prevTop.current;
    if (!before) {
      // first paint of this channel
      if (!(wantedMessage && scrollToMessage(wantedMessage))) el.scrollTop = el.scrollHeight;
    } else if (before.firstId !== first && before.lastId === last?.id) {
      // earlier messages were added above: keep what the reader was looking at where it was
      el.scrollTop = before.top + (el.scrollHeight - before.height);
    } else if (before.lastId !== last?.id) {
      const mine = last?.author_id === viewerId;
      if (atBottom.current || mine) scrollToBottom(true);
    }
    prevTop.current = { firstId: first, lastId: last?.id ?? null, height: el.scrollHeight, top: el.scrollTop };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all]);

  // keep pinned to the bottom while pictures finish loading
  useEffect(() => {
    const el = scroller.current;
    const list = el?.firstElementChild;
    if (!el || !list || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (atBottom.current) el.scrollTop = el.scrollHeight;
    });
    ro.observe(list);
    return () => ro.disconnect();
  }, []);

  function onScroll(e) {
    const el = e.currentTarget;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM;
    const newest = all.at(-1)?.id ?? null;
    if (atBottom.current && newest && newest !== seenId) {
      setSeenId(newest);
      chan.markRead();
    }
    if (prevTop.current) prevTop.current.top = el.scrollTop;
  }

  // earlier messages load when the reader reaches the top
  const topSentinel = useRef(null);
  const { loadOlder, hasMore } = chan;
  useEffect(() => {
    const node = topSentinel.current;
    if (!node || !hasMore || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        const el = scroller.current;
        prevTop.current = prevTop.current && { ...prevTop.current, height: el.scrollHeight, top: el.scrollTop };
        loadOlder();
      }
    }, { root: scroller.current, rootMargin: "120px" });
    io.observe(node);
    return () => io.disconnect();
  }, [hasMore, loadOlder]);

  // ── actions ──
  const onReply = useCallback((m) => {
    const name = chan.people[m.author_id]?.full_name ?? "UniSphere member";
    setReplyTo({ id: m.id, authorName: name, snippet: m.body.replace(/\s+/g, " ").slice(0, 80) || "Attachment" });
  }, [chan.people]);
  const onEdit = useCallback((m, body) => chan.edit(m.id, body), [chan]);
  const onPin = useCallback(async (m, pinned) => {
    const res = await chan.pin(m.id, pinned);
    if (res.ok) toast.success(pinned ? "Pinned" : "Unpinned");
    else toast.error(res.error);
  }, [chan]);
  const onRemove = useCallback((m, mode) => (mode === "own" ? setDeleting(m) : setRemoving(m)), []);
  const onReport = useCallback((m) => setReporting(m), []);

  const grouped = (m, prev) =>
    prev && prev.author_id === m.author_id && prev.status === "sent" && m.status === "sent" && !m.reply_to_id && new Date(m.created_at) - new Date(prev.created_at) < GROUP_MS && dayLabel(prev.created_at) === dayLabel(m.created_at);

  const lastReadAt = channel.lastReadAt;
  const firstUnread = lastReadAt ? chan.messages.find((m) => m.created_at > lastReadAt && m.author_id !== viewerId)?.id : null;

  return (
    <section className="flex h-full min-h-0 flex-col" aria-label={`Channel ${channel.name}`}>
      <header className="flex items-center gap-1.5 border-b px-2 py-2 sm:px-4">
        <Button asChild variant="ghost" size="icon-sm" className="md:hidden">
          <Link href={`/communities/${slug}/channels`} aria-label="All channels"><ChevronLeft /></Link>
        </Button>
        <ChannelIcon type={channel.type} className="text-muted-foreground size-5 shrink-0" />
        <div className="min-w-0 flex-1 leading-tight">
          <h1 className="font-heading truncate text-base font-bold">{channel.name}</h1>
          {(channel.topic || channel.description) && <p className="text-muted-foreground truncate text-xs">{channel.topic || channel.description}</p>}
        </div>
        {aiAvailable && channel.type !== "staff" && channel.min_view_role === "member" && <Button variant="ghost" size="icon-sm" onClick={() => setSummary(true)} aria-label="Summarise this channel with AI"><Sparkles /></Button>}
        <Button variant="ghost" size="icon-sm" onClick={() => setSearch(true)} aria-label="Search messages"><Search /></Button>
        <Button variant="ghost" size="icon-sm" onClick={() => setPins(true)} aria-label="Pinned messages"><Pin /></Button>
        <NotificationMenu communityId={community.id} channel={channel} prefs={prefs} />
        {manager && (
          <Button asChild variant="ghost" size="icon-sm">
            <Link href={`/communities/${slug}/settings?tab=channels`} aria-label="Manage channels"><Settings /></Link>
          </Button>
        )}
      </header>

      {connection === "offline" && (
        <p role="status" className="bg-muted text-muted-foreground flex items-center gap-2 border-b px-4 py-1.5 text-xs">
          <WifiOff className="size-3.5" aria-hidden="true" /> Live updates are paused. We will catch up when the connection returns.
        </p>
      )}
      {channel.rules && (
        <details className="bg-muted/50 border-b px-4 py-1.5 text-xs">
          <summary className="cursor-pointer font-semibold select-none">Channel rules</summary>
          <div className="mt-1"><ChatMarkdown text={channel.rules} /></div>
        </details>
      )}

      <div ref={scroller} onScroll={onScroll} className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain" role="log" aria-live="polite" aria-relevant="additions" aria-label={`Messages in ${channel.name}`} tabIndex={0}>
        <div className="py-3">
          {chan.hasMore ? (
            <div ref={topSentinel} className="text-muted-foreground flex min-h-10 items-center justify-center text-xs">
              {chan.loadingOlder ? <Loader2 className="size-4 animate-spin" aria-label="Loading earlier messages" /> : <button type="button" onClick={() => chan.loadOlder()} className="hover:text-foreground underline">Load earlier messages</button>}
            </div>
          ) : (
            all.length > 0 && <p className="text-muted-foreground px-4 pb-2 text-center text-xs">This is the start of #{channel.name}.</p>
          )}
          {chan.error && <p role="alert" className="text-destructive-text px-4 text-center text-xs">{chan.error}</p>}
          {all.length === 0 && (
            <div className="text-muted-foreground flex flex-col items-center gap-2 px-6 py-16 text-center">
              <ChannelIcon type={channel.type} className="size-8" />
              <p className="text-foreground font-heading font-bold">Welcome to #{channel.name}</p>
              <p className="max-w-sm text-sm">{channel.description || "No messages yet."} {postState === "ok" ? "Say hello and start the conversation." : ""}</p>
            </div>
          )}
          <ul>
            {all.map((m, i) => {
              const prev = all[i - 1];
              const send = pendingByMessageId.get(m.id);
              const showDivider = m.id === firstUnread;
              return (
                <Fragment key={m.id}>
                  <MessageItem
                    unreadDivider={showDivider}
                    fresh={!initialIds.has(m.id)}
                    m={m}
                    author={chan.people[m.author_id]}
                    grouped={grouped(m, prev)}
                    newDay={!prev || dayLabel(prev.created_at) !== dayLabel(m.created_at)}
                    viewerId={viewerId}
                    replyTarget={m.reply_to_id ? chan.byId.get(m.reply_to_id) ?? chan.refs[m.reply_to_id] : null}
                    people={chan.people}
                    can={can}
                    highlighted={highlight === m.id}
                    send={send}
                    onReply={onReply}
                    onEdit={onEdit}
                    onRemove={onRemove}
                    onPin={onPin}
                    onReport={onReport}
                    onJump={jumpTo}
                    onRetry={chan.retry}
                    onDiscard={chan.discard}
                  />
                </Fragment>
              );
            })}
          </ul>
        </div>
        {newCount > 0 && (
          <div className="pointer-events-none sticky bottom-3 flex justify-center motion-safe:animate-in motion-safe:fade-in motion-safe:delay-200">
            <Button size="sm" className="pointer-events-auto rounded-full shadow-pop" onClick={() => { scrollToBottom(true); setSeenId(all.at(-1)?.id ?? null); chan.markRead(); }}>
              <ArrowDown /> {newCount} new message{newCount === 1 ? "" : "s"}
            </Button>
          </div>
        )}
      </div>

      <ChannelComposer
          channel={channel}
          communityId={community.id}
          postState={postState}
          slowModeExempt={roleAtLeast(role, "moderator")}
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
          onSend={(msg) => chan.send(msg)}
          onRulesAccepted={() => setPostState("ok")}
        />

      <PinsSheet open={pins} onOpenChange={setPins} channelId={channel.id} />
      {aiAvailable && <SummarySheet open={summary} onOpenChange={setSummary} channelId={channel.id} />}
      <SearchSheet open={search} onOpenChange={setSearch} communityId={community.id} channelId={channel.id} slug={slug} onJump={jumpTo} />

      <CommunityReportDialog open={Boolean(reporting)} onOpenChange={(v) => !v && setReporting(null)} communityId={community.id} targetType="channel_message" targetId={reporting?.id} />
      <RemoveMessageDialog
        open={Boolean(removing)}
        onOpenChange={(v) => !v && setRemoving(null)}
        onConfirm={async (reason) => {
          const res = await chan.remove(removing.id, { reason });
          if (res.ok) toast.success("Message removed");
          return res;
        }}
      />
      <AlertDialog open={Boolean(deleting)} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this message?</AlertDialogTitle>
            <AlertDialogDescription>The text and any files are removed for everyone. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-white"
              onClick={async () => {
                const res = await chan.remove(deleting.id);
                if (res.ok) toast.success("Message deleted");
                else toast.error(res.error);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
