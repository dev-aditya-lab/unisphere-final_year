"use client";

import { useCallback, useEffect, useId, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import { Hash, Loader2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { UserAvatar } from "@/components/user-avatar";
import { BlueTick } from "@/components/ui/blue-tick";
import { searchPeopleAction } from "@/lib/actions/people";
import { suggestHashtagsAction } from "@/lib/actions/posts";
import { cn } from "@/lib/utils";

// The text just before the caret: "@" or "#" at the start of a word, followed by the characters typed so far.
const TRIGGER = /(^|\s)([@#])([a-z0-9_-]{0,30})$/i;

// Trending tags are fetched once and shared by every composer on the page (they change slowly).
let tagCache = { at: 0, tags: null, inflight: null };
const TAG_TTL_MS = 5 * 60 * 1000;
function loadTags() {
  if (tagCache.tags && Date.now() - tagCache.at < TAG_TTL_MS) return Promise.resolve(tagCache.tags);
  if (tagCache.inflight) return tagCache.inflight;
  tagCache.inflight = suggestHashtagsAction()
    .then((res) => {
      tagCache = { at: Date.now(), tags: res.ok ? res.tags : [], inflight: null };
      return tagCache.tags;
    })
    .catch(() => {
      tagCache = { ...tagCache, inflight: null };
      return [];
    });
  return tagCache.inflight;
}

function readTrigger(text, caret) {
  const m = TRIGGER.exec(text.slice(0, caret));
  if (!m) return null;
  const query = m[3];
  const type = m[2] === "@" ? "mention" : "hashtag";
  if (type === "hashtag" && /-/.test(query)) return null; // tags are letters, digits and underscores only
  return { type, query, start: caret - query.length - 1, caret };
}

/**
 * A textarea that suggests people while the member types "@name" and tags while they type "#tag".
 * The suggestions are an inline list under the field (a combobox popup that never leaves the screen, whatever the
 * keyboard is doing). Arrow keys move, Enter or Tab inserts, Escape closes the list only. The caret ends right after the
 * inserted word. `ref` exposes `focus()` and `insertTrigger("@" | "#")` for toolbar buttons.
 */
export function SuggestTextarea({ ref, value, onChange, onSuggestOpenChange, className, ...props }) {
  const taRef = useRef(null);
  const listId = useId();
  const [trigger, setTrigger] = useState(null);
  const [people, setPeople] = useState({ query: "", items: [], loading: false });
  const [tags, setTags] = useState(null);
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState(null); // the trigger position the member closed with Escape
  const pendingCaret = useRef(null);
  const requestId = useRef(0);

  // After an insertion the new text is rendered first; then the caret is placed right behind it.
  useLayoutEffect(() => {
    if (pendingCaret.current === null || !taRef.current) return;
    const pos = pendingCaret.current;
    pendingCaret.current = null;
    taRef.current.focus();
    taRef.current.setSelectionRange(pos, pos);
  }, [value]);

  const refresh = useCallback((el) => {
    setTrigger(readTrigger(el.value, el.selectionStart ?? el.value.length));
    setActive(0);
  }, []);

  // People: ask the server (RLS decides who is visible) once two letters are typed, newest query wins.
  const mentionQuery = trigger?.type === "mention" ? trigger.query : null;
  useEffect(() => {
    if (mentionQuery === null || mentionQuery.length < 2) return;
    const id = ++requestId.current;
    const t = setTimeout(async () => {
      setPeople((p) => ({ ...p, loading: true }));
      let items = [];
      try {
        const res = await searchPeopleAction({ query: mentionQuery });
        if (res?.ok) items = res.people;
      } catch {
        /* no suggestions this time; the member can keep typing */
      }
      if (id === requestId.current) setPeople({ query: mentionQuery, items, loading: false });
    }, 200);
    return () => clearTimeout(t);
  }, [mentionQuery]);

  const hashtagActive = trigger?.type === "hashtag";
  useEffect(() => {
    if (!hashtagActive || tags) return;
    let live = true;
    loadTags().then((list) => live && setTags(list));
    return () => {
      live = false;
    };
  }, [hashtagActive, tags]);

  let options = [];
  let status = null;
  if (trigger?.type === "mention") {
    if (trigger.query.length < 2) status = "Keep typing to find someone";
    else if (people.query === trigger.query) {
      options = people.items.map((p) => ({ key: p.id, insert: p.username, person: p }));
      if (options.length === 0) status = `No one found for “${trigger.query}”`;
    } else status = "Searching…";
  } else if (trigger?.type === "hashtag") {
    const q = trigger.query.toLowerCase();
    const matching = (tags ?? []).filter((t) => t.startsWith(q) && t !== q).slice(0, 5);
    options = matching.map((t) => ({ key: t, insert: t, tag: t }));
    // The tag being typed is always an option, so a brand-new tag never needs the list to know about it.
    if (q.length >= 2) options.unshift({ key: `new:${q}`, insert: q, tag: q, isNew: !(tags ?? []).includes(q) });
    if (options.length === 0) status = q ? "Keep typing to name a tag" : "Type a tag, for example #robotics";
  }

  const open = Boolean(trigger) && dismissed !== trigger?.start && (options.length > 0 || Boolean(status));
  useEffect(() => {
    onSuggestOpenChange?.(open);
  }, [open, onSuggestOpenChange]);

  function choose(option) {
    if (!trigger) return;
    const word = `${trigger.type === "mention" ? "@" : "#"}${option.insert} `;
    const next = value.slice(0, trigger.start) + word + value.slice(trigger.caret);
    pendingCaret.current = trigger.start + word.length;
    setTrigger(null);
    onChange(next);
  }

  function onKeyDown(e) {
    props.onKeyDown?.(e);
    if (!open) return;
    if (e.key === "Escape") {
      e.preventDefault();
      setDismissed(trigger.start);
      return;
    }
    if (options.length === 0) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i + (e.key === "ArrowDown" ? 1 : -1) + options.length) % options.length);
    } else if ((e.key === "Enter" || e.key === "Tab") && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      choose(options[Math.min(active, options.length - 1)]);
    }
  }

  useImperativeHandle(ref, () => ({
    focus: () => taRef.current?.focus(),
    insertTrigger(char) {
      const el = taRef.current;
      if (!el) return;
      const start = el.selectionStart ?? value.length;
      const end = el.selectionEnd ?? start;
      const before = value.slice(0, start);
      const needsSpace = before.length > 0 && !/\s$/.test(before);
      const insert = `${needsSpace ? " " : ""}${char}`;
      pendingCaret.current = start + insert.length;
      onChange(before + insert + value.slice(end));
      // The trigger only exists once the new value is rendered; read it then.
      requestAnimationFrame(() => taRef.current && refresh(taRef.current));
    },
  }));

  const activeOption = open && options.length > 0 ? options[Math.min(active, options.length - 1)] : null;

  return (
    <div>
      <Textarea
        {...props}
        ref={taRef}
        value={value}
        role="combobox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={activeOption ? `${listId}-${activeOption.key}` : undefined}
        className={className}
        onChange={(e) => {
          setDismissed(null);
          onChange(e.target.value);
          refresh(e.target);
        }}
        onKeyDown={onKeyDown}
        onKeyUp={(e) => {
          if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "Home" || e.key === "End") refresh(e.currentTarget);
        }}
        onClick={(e) => refresh(e.currentTarget)}
        onBlur={(e) => {
          props.onBlur?.(e);
          // Let a click on a suggestion land before the list goes away.
          setTimeout(() => setTrigger(null), 120);
        }}
      />
      {open && (
        <div className="bg-popover mt-1 overflow-hidden rounded-xl border shadow-pop" data-slot="suggestions">
          {options.length > 0 ? (
            <ul id={listId} role="listbox" aria-label={trigger.type === "mention" ? "People" : "Hashtags"} className="max-h-48 overflow-y-auto overscroll-contain p-1">
              {options.map((o, i) => (
                <li
                  key={o.key}
                  id={`${listId}-${o.key}`}
                  role="option"
                  aria-selected={i === Math.min(active, options.length - 1)}
                  // mousedown keeps the textarea focused, so the click is not swallowed by the blur
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(o);
                  }}
                  onMouseMove={() => setActive(i)}
                  className={cn("flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm", i === Math.min(active, options.length - 1) && "bg-accent")}
                >
                  {o.person ? (
                    <>
                      <UserAvatar name={o.person.full_name} avatarKey={o.person.avatar_key} size="sm" />
                      <span className="min-w-0 leading-tight">
                        <span className="flex items-center gap-1 truncate font-semibold">
                          {o.person.full_name}
                          {o.person.blue_tick && <BlueTick className="size-3.5" />}
                        </span>
                        <span className="text-muted-foreground block truncate text-xs">@{o.person.username}</span>
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="bg-primary-soft text-primary-text grid size-8 shrink-0 place-items-center rounded-full">
                        <Hash className="size-4" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 truncate font-semibold">#{o.tag}</span>
                      {o.isNew && <span className="text-muted-foreground ml-auto shrink-0 text-xs">New tag</span>}
                    </>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p role="status" className="text-muted-foreground flex items-center gap-2 px-3 py-2.5 text-xs">
              {status === "Searching…" && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
              {status}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
