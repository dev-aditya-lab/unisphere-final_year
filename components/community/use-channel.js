"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { useWorkspace } from "@/components/community/workspace-provider";

/**
 * The state of one open channel: the confirmed messages, the ones still being sent, who wrote them, and every way they change.
 *
 * Rules that keep it correct:
 *  - a message is stored once, by id. A live event, the answer to our own send and a catch-up page can all carry the same message in
 *    any order; whichever arrives, there is one row (`ingest`);
 *  - a message that was deleted or removed never comes back as "sent" because an older copy arrived late;
 *  - a message we are sending has a client id the server uses as an idempotency key, so a retry, a second tab or a lost response
 *    can never post it twice. When the confirmed message arrives (from the answer or from the live event, whichever is first), the
 *    pending copy is dropped, so there is no flash of two;
 *  - after a drop in the connection the hook asks for what it missed by cursor, then refreshes the newest page to pick up edits,
 *    deletions and pins that happened meanwhile. It never reloads the history.
 * The database stays the source of truth; nothing here is stored on the device.
 */

const cmp = (a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const KEEP_LIVE = 600;

const rowToWire = (r) => ({
  id: r.id,
  channel_id: r.channel_id,
  author_id: r.author_id ?? null,
  body: r.status !== "sent" ? "" : r.body ?? "",
  reply_to_id: r.reply_to_id ?? null,
  status: r.status,
  pinned_at: r.status !== "sent" ? null : r.pinned_at ?? null,
  edited_at: r.edited_at ?? null,
  created_at: r.created_at,
  client_op_id: r.client_op_id ?? null,
  mentions: r.status !== "sent" || !Array.isArray(r.mentions) ? [] : r.mentions,
  attachments: r.status !== "sent" || !Array.isArray(r.attachments) ? [] : r.attachments,
});

function mergeMessage(prev, next) {
  if (!prev) return next;
  if (prev.status !== "sent" && next.status === "sent") return prev;
  const merged = { ...prev, ...next };
  return JSON.stringify(merged) === JSON.stringify(prev) ? prev : merged;
}

function reducer(state, a) {
  switch (a.type) {
    case "ingest": {
      const map = new Map(state.messages.map((m) => [m.id, m]));
      let pending = state.pending;
      let changed = false;
      for (const m of a.items) {
        const prev = map.get(m.id);
        const next = mergeMessage(prev, m);
        if (next !== prev) {
          map.set(m.id, next);
          changed = true;
        }
        if (m.client_op_id && pending.some((p) => p.opId === m.client_op_id)) pending = pending.filter((p) => p.opId !== m.client_op_id);
      }
      if (!changed && pending === state.pending) return state;
      let messages = [...map.values()].sort(cmp);
      let hasMore = state.hasMore;
      if (a.live && messages.length > KEEP_LIVE) {
        messages = messages.slice(messages.length - KEEP_LIVE + 100);
        hasMore = true;
      }
      return { ...state, messages, pending, hasMore };
    }
    case "older":
      return { ...reducer(state, { type: "ingest", items: a.items }), hasMore: a.hasMore, loadingOlder: false };
    case "loading-older":
      return { ...state, loadingOlder: a.value };
    case "people":
      return { ...state, people: { ...state.people, ...a.people } };
    case "refs":
      return { ...state, refs: { ...state.refs, ...a.refs } };
    case "pending-add":
      return { ...state, pending: [...state.pending, a.item] };
    case "pending-update":
      return { ...state, pending: state.pending.map((p) => (p.opId === a.opId ? { ...p, ...a.patch } : p)) };
    case "pending-remove":
      return { ...state, pending: state.pending.filter((p) => p.opId !== a.opId) };
    case "error":
      return { ...state, error: a.error };
    default:
      return state;
  }
}

async function api(path, init) {
  const res = await fetch(path, { cache: "no-store", ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const json = await res.json().catch(() => null);
  return { res, json };
}

export function useChannel({ channelId, seed }) {
  const { viewerId, subscribe, clearUnread } = useWorkspace();
  const [state, dispatch] = useReducer(reducer, null, () => ({
    messages: seed.items ?? [],
    pending: [],
    people: seed.people ?? {},
    refs: seed.refs ?? {},
    hasMore: Boolean(seed.hasMore),
    loadingOlder: false,
    error: null,
  }));
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });
  const fetching = useRef(new Set());
  const readTimer = useRef(null);

  // ── names for authors we have not met yet (a live message from someone new) ──
  const peopleTimer = useRef(null);
  const wanted = useRef(new Set());
  const needPeople = useCallback(
    (ids) => {
      for (const id of ids) if (id && !stateRef.current.people[id] && !fetching.current.has(id)) wanted.current.add(id);
      if (!wanted.current.size) return;
      clearTimeout(peopleTimer.current);
      peopleTimer.current = setTimeout(async () => {
        const ids = [...wanted.current].slice(0, 50);
        wanted.current.clear();
        ids.forEach((i) => fetching.current.add(i));
        try {
          const { json } = await api(`/api/community-channels/${channelId}/people?ids=${ids.join(",")}`);
          if (json?.ok) dispatch({ type: "people", people: json.people });
        } catch {
          /* names are a nicety: the message is shown as "UniSphere member" until the next time */
        } finally {
          ids.forEach((i) => fetching.current.delete(i));
        }
      }, 150);
    },
    [channelId],
  );
  useEffect(() => () => clearTimeout(peopleTimer.current), []);

  // ── reading ──
  const markRead = useCallback(() => {
    clearTimeout(readTimer.current);
    readTimer.current = setTimeout(() => {
      if (document.visibilityState !== "visible") return;
      clearUnread(channelId);
      fetch(`/api/community-channels/${channelId}/read`, { method: "POST", cache: "no-store" }).catch(() => {});
    }, 800);
  }, [channelId, clearUnread]);
  useEffect(() => () => clearTimeout(readTimer.current), []);
  useEffect(() => {
    markRead();
  }, [markRead]);

  // ── live events, and catching up after a drop ──
  const catchUp = useCallback(async () => {
    try {
      let last = stateRef.current.messages.at(-1);
      for (let page = 0; page < 5 && last; page++) {
        const q = new URLSearchParams({ afterTs: last.created_at, afterId: last.id, limit: "100" });
        const { res, json } = await api(`/api/community-channels/${channelId}/messages?${q}`);
        if (!res.ok || !json?.ok) break;
        dispatch({ type: "ingest", items: json.items });
        dispatch({ type: "people", people: json.people });
        dispatch({ type: "refs", refs: json.refs });
        if (json.items.length < 100) break;
        last = json.items.at(-1);
      }
      // edits, deletions and pins that happened while we were away
      const { res, json } = await api(`/api/community-channels/${channelId}/messages?limit=40`);
      if (res.ok && json?.ok) {
        dispatch({ type: "ingest", items: json.items });
        dispatch({ type: "people", people: json.people });
        dispatch({ type: "refs", refs: json.refs });
      }
      // sends that failed only because the network was away go out again (the server de-duplicates by client id)
      stateRef.current.pending.filter((p) => p.status === "failed" && p.retryable).forEach((p) => post(p));
    } catch {
      /* still offline: the next signal tries again */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  useEffect(
    () =>
      subscribe((event) => {
        if (event.type === "reconnected") {
          catchUp();
          return;
        }
        const row = event.row;
        if (row.channel_id !== channelId) return;
        const wire = rowToWire(row);
        dispatch({ type: "ingest", items: [wire], live: event.eventType === "INSERT" });
        if (event.eventType === "INSERT") {
          needPeople([wire.author_id]);
          if (wire.reply_to_id && !stateRef.current.messages.some((m) => m.id === wire.reply_to_id)) dispatch({ type: "refs", refs: { [wire.reply_to_id]: stateRef.current.refs[wire.reply_to_id] ?? { id: wire.reply_to_id, author_id: null, status: "sent", body: "" } } });
          if (wire.author_id !== viewerId) markRead();
        }
      }),
    [subscribe, channelId, catchUp, needPeople, markRead, viewerId],
  );

  // ── sending ──
  async function post(item) {
    dispatch({ type: "pending-update", opId: item.opId, patch: { status: "sending", error: null } });
    try {
      const { res, json } = await api(`/api/community-channels/${channelId}/messages`, {
        method: "POST",
        body: JSON.stringify({ body: item.body, fileIds: item.files.map((f) => f.id), replyTo: item.replyTo ?? null, clientOpId: item.opId }),
      });
      if (res.ok && json?.ok) {
        dispatch({ type: "ingest", items: [json.message], live: true });
        dispatch({ type: "pending-remove", opId: item.opId });
        return;
      }
      const retryable = res.status >= 500 || res.status === 429;
      dispatch({ type: "pending-update", opId: item.opId, patch: { status: "failed", error: json?.error ?? "The message could not be sent.", code: json?.code, retryable } });
    } catch {
      dispatch({ type: "pending-update", opId: item.opId, patch: { status: "failed", error: "You appear to be offline. The message was not sent.", retryable: true } });
    }
  }

  const send = useCallback(
    ({ body, files = [], replyTo = null }) => {
      const item = { opId: crypto.randomUUID(), body, files, replyTo, status: "sending", created: Date.now(), error: null, retryable: false };
      dispatch({ type: "pending-add", item });
      post(item);
      return item.opId;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [channelId],
  );
  const retry = useCallback((opId) => {
    const item = stateRef.current.pending.find((p) => p.opId === opId);
    if (item) post(item);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const discard = useCallback((opId) => dispatch({ type: "pending-remove", opId }), []);

  // ── older history ──
  const loadOlder = useCallback(async () => {
    const s = stateRef.current;
    if (!s.hasMore || s.loadingOlder || s.messages.length === 0) return false;
    dispatch({ type: "loading-older", value: true });
    const first = s.messages[0];
    try {
      const q = new URLSearchParams({ beforeTs: first.created_at, beforeId: first.id, limit: "40" });
      const { res, json } = await api(`/api/community-channels/${channelId}/messages?${q}`);
      if (!res.ok || !json?.ok) throw new Error("load");
      dispatch({ type: "people", people: json.people });
      dispatch({ type: "refs", refs: json.refs });
      dispatch({ type: "older", items: json.items, hasMore: json.hasMore });
      return true;
    } catch {
      dispatch({ type: "loading-older", value: false });
      dispatch({ type: "error", error: "Earlier messages could not be loaded." });
      return false;
    }
  }, [channelId]);

  // ── changing a message ──
  const edit = useCallback(async (id, body) => {
    const { res, json } = await api(`/api/community-messages/${id}`, { method: "PATCH", body: JSON.stringify({ body }) });
    if (res.ok && json?.ok) {
      dispatch({ type: "ingest", items: [json.message] });
      return { ok: true };
    }
    return { ok: false, error: json?.error ?? "The edit could not be saved." };
  }, []);

  const remove = useCallback(async (id, { reason = null, reportId = null } = {}) => {
    const { res, json } = await api(`/api/community-messages/${id}`, { method: "DELETE", body: JSON.stringify({ reason, reportId }) });
    if (res.ok && json?.ok) {
      const prev = stateRef.current.messages.find((m) => m.id === id);
      if (prev) dispatch({ type: "ingest", items: [{ ...prev, status: json.status, body: "", attachments: [], mentions: [], pinned_at: null }] });
      return { ok: true };
    }
    return { ok: false, error: json?.error ?? "That could not be removed." };
  }, []);

  const pin = useCallback(async (id, pinned) => {
    const { res, json } = await api(`/api/community-messages/${id}/pin`, { method: "POST", body: JSON.stringify({ pinned }) });
    if (res.ok && json?.ok) {
      const prev = stateRef.current.messages.find((m) => m.id === id);
      if (prev) dispatch({ type: "ingest", items: [{ ...prev, pinned_at: pinned ? new Date().toISOString() : null }] });
      return { ok: true };
    }
    return { ok: false, error: json?.error ?? "That could not be changed." };
  }, []);

  const byId = useMemo(() => new Map(state.messages.map((m) => [m.id, m])), [state.messages]);
  return { ...state, byId, send, retry, discard, loadOlder, edit, remove, pin, markRead, catchUp };
}
