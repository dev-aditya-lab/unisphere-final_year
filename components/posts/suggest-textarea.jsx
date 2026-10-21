"use client";

import { useCallback, useEffect, useId, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import { Hash, Loader2, TriangleAlert } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { UserAvatar } from "@/components/user-avatar";
import { BlueTick } from "@/components/ui/blue-tick";
import { suggestHashtagsAction, suggestMentionsAction } from "@/lib/actions/discovery";
import { findTrigger } from "@/lib/text-triggers";
import { cn } from "@/lib/utils";

const DEBOUNCE_MS = 150;
const CACHE_TTL_MS = 60_000;
const CACHE_MAX = 40;

/**
 * A textarea that suggests people while the member types "@name" and tags while they type "#tag".
 *
 *  - The word being typed is found from the caret position (lib/text-triggers.js, the same boundaries the server uses
 *    to read mentions and tags), so it works mid-sentence, after pasting, and after backspacing back to the trigger.
 *  - Results come from the database through server actions (people the member may see; tags used in public posts).
 *    Requests are debounced, results are bounded, and a reply to an older query can never replace a newer one.
 *  - The list is inline under the field, so it cannot leave the screen whatever the on-screen keyboard is doing.
 *    Arrow keys move, Enter or Tab inserts, Escape closes only the list. The caret ends right behind the insertion.
 *  - `ref` exposes `focus()` and `insertTrigger("@" | "#")` for toolbar buttons.
 */
export function SuggestTextarea({ ref, value, onChange, onSuggestOpenChange, mentions = true, hashtags = true, className, ...props }) {
  const taRef = useRef(null);
  const listRef = useRef(null);
  const listId = useId();
  const [trigger, setTrigger] = useState(null);
  const [result, setResult] = useState({ key: "", items: [], error: false });
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState(null); // the trigger position the member closed with Escape
  const pendingCaret = useRef(null);
  const latest = useRef(0);
  const cache = useRef(new Map());

  // After an insertion the new text is rendered first; then the caret is placed right behind it.
  useLayoutEffect(() => {
    if (pendingCaret.current === null || !taRef.current) return;
    const pos = pendingCaret.current;
    pendingCaret.current = null;
    taRef.current.focus();
    taRef.current.setSelectionRange(pos, pos);
  }, [value]);

  const refresh = useCallback(
    (el) => {
      const next = findTrigger(el.value, el.selectionStart ?? el.value.length);
      const allowed = next && ((next.type === "mention" && mentions) || (next.type === "hashtag" && hashtags));
      setTrigger((prev) => {
        const t = allowed ? next : null;
        if (!t && !prev) return prev;
        if (t && prev && t.type === prev.type && t.query === prev.query && t.start === prev.start) return prev;
        return t;
      });
      setActive(0);
    },
    [mentions, hashtags],
  );

  const key = trigger ? `${trigger.type}:${trigger.query}` : null;
  useEffect(() => {
    if (!key) return;
    const [type, query] = [trigger.type, trigger.query];
    const hit = cache.current.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      setResult({ key, items: hit.items, error: false });
      return;
    }
    const id = ++latest.current;
    const t = setTimeout(async () => {
      let items = [];
      let error = false;
      try {
        const res = await (type === "mention" ? suggestMentionsAction({ query }) : suggestHashtagsAction({ query }));
        if (res?.ok) items = type === "mention" ? res.people : res.tags;
        else error = true;
      } catch {
        error = true;
      }
      if (id !== latest.current) return; // a newer query has been sent since: this answer is stale
      if (!error) {
        if (cache.current.size >= CACHE_MAX) cache.current.delete(cache.current.keys().next().value);
        cache.current.set(key, { at: Date.now(), items });
      }
      setResult({ key, items, error });
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
    // `trigger` is derived from `key`; only a change of the query should restart the request
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const current = key !== null && result.key === key;
  let options = [];
  let status = null;
  if (trigger) {
    if (!current) status = "Searching…";
    else if (result.error) status = "Could not load suggestions. Your text is safe: keep typing.";
    else if (trigger.type === "mention") {
      options = result.items.map((p) => ({ key: p.id, insert: p.username, person: p }));
      if (!options.length) status = trigger.query ? `No one found for “${trigger.query}”` : "Type a name or username to mention someone";
    } else {
      options = result.items.map((t) => ({ key: t.tag, insert: t.tag, tag: t.tag, uses: t.uses }));
      const q = trigger.query.toLowerCase();
      // The tag being typed is always an option (last, so Enter completes to the best existing match first), which means a
      // brand-new tag never needs the list to know about it.
      if (q.length >= 2 && !options.some((o) => o.tag === q)) options.push({ key: `new:${q}`, insert: q, tag: q, isNew: true });
      if (!options.length) status = q ? "Keep typing to name a tag" : "Type a tag, for example #robotics";
    }
  }

  const open = Boolean(trigger) && dismissed !== trigger?.start && (options.length > 0 || Boolean(status));
  useEffect(() => {
    onSuggestOpenChange?.(open);
  }, [open, onSuggestOpenChange]);

  const activeIndex = Math.min(active, Math.max(0, options.length - 1));
  // Keep the highlighted row on screen inside the (scrollable) list, and the list on screen inside the page.
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector("[aria-selected='true']")?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex, options.length]);
  useEffect(() => {
    if (open) listRef.current?.scrollIntoView({ block: "nearest" });
  }, [open]);

  function choose(option) {
    if (!trigger) return;
    const word = `${trigger.type === "mention" ? "@" : "#"}${option.insert} `;
    const next = value.slice(0, trigger.start) + word + value.slice(trigger.end).replace(/^\s/, "");
    pendingCaret.current = trigger.start + word.length;
    setTrigger(null);
    onChange(next);
  }

  function onKeyDown(e) {
    props.onKeyDown?.(e);
    if (!open || e.nativeEvent.isComposing) return;
    if (e.key === "Escape") {
      e.preventDefault();
      setDismissed(trigger.start);
      return;
    }
    if (options.length === 0) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i + (e.key === "ArrowDown" ? 1 : -1) + options.length) % options.length);
    } else if ((e.key === "Enter" || e.key === "Tab") && !e.shiftKey) {
      e.preventDefault();
      choose(options[activeIndex]);
    }
  }

  useImperativeHandle(ref, () => ({
    focus: () => {
      const el = taRef.current;
      if (!el) return;
      el.focus();
      // Pre-filled or restored text: carry on from the end, not from the start.
      el.setSelectionRange(el.value.length, el.value.length);
    },
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

  const activeOption = open && options.length > 0 ? options[activeIndex] : null;

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
          if (!e.nativeEvent.isComposing) refresh(e.target);
        }}
        onKeyDown={onKeyDown}
        // Caret moves (arrow keys, taps, a mouse click, selection handles on a phone) all raise "select".
        onSelect={(e) => refresh(e.currentTarget)}
        onBlur={(e) => {
          props.onBlur?.(e);
          // Let a tap on a suggestion land before the list goes away. The draft is untouched either way.
          setTimeout(() => setTrigger(null), 150);
        }}
      />
      {open && (
        <div ref={listRef} className="bg-popover mt-1 overflow-hidden rounded-xl border shadow-pop" data-slot="suggestions">
          {options.length > 0 ? (
            <ul id={listId} role="listbox" aria-label={trigger.type === "mention" ? "People" : "Hashtags"} className="max-h-48 overflow-y-auto overscroll-contain p-1">
              {options.map((o, i) => (
                <li
                  key={o.key}
                  id={`${listId}-${o.key}`}
                  role="option"
                  aria-selected={i === activeIndex}
                  // mousedown keeps the textarea focused, so the tap is not swallowed by the blur
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(o);
                  }}
                  onMouseMove={() => setActive(i)}
                  className={cn("flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm", i === activeIndex && "bg-accent")}
                >
                  {o.person ? (
                    <>
                      <UserAvatar name={o.person.full_name} avatarKey={o.person.avatar_key} size="sm" />
                      <span className="min-w-0 flex-1 leading-tight">
                        <span className="flex items-center gap-1 truncate font-semibold">
                          {o.person.full_name}
                          {o.person.blue_tick && <BlueTick className="size-3.5" />}
                        </span>
                        <span className="text-muted-foreground block truncate text-xs">@{o.person.username}</span>
                      </span>
                      {o.person.followed && <span className="text-muted-foreground shrink-0 text-xs">Following</span>}
                    </>
                  ) : (
                    <>
                      <span className="bg-primary-soft text-primary-text grid size-8 shrink-0 place-items-center rounded-full">
                        <Hash className="size-4" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1 truncate font-semibold">#{o.tag}</span>
                      {o.isNew ? (
                        <span className="text-muted-foreground shrink-0 text-xs">New tag</span>
                      ) : (
                        o.uses > 0 && <span className="text-muted-foreground shrink-0 text-xs tabular-nums">{o.uses} {o.uses === 1 ? "post" : "posts"}</span>
                      )}
                    </>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p role="status" className="text-muted-foreground flex items-center gap-2 px-3 py-2.5 text-xs">
              {status === "Searching…" && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
              {result.error && current && <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />}
              {status}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
