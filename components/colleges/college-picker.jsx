"use client";

import { useCallback, useEffect, useId, useRef, useState, useTransition } from "react";
import { GraduationCap, Landmark, Loader2, MapPin, Plus, Search, X } from "lucide-react";
import { ListingBadge, collegeLocation } from "@/components/colleges/listing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createCollegeAction } from "@/lib/actions/colleges";
import { cn } from "@/lib/utils";

const DEBOUNCE_MS = 250;
const MIN_CHARS = 2;

function SelectedCollege({ college, onClear, disabled, note = true }) {
  return (
    <div className="bg-card flex items-start gap-3 rounded-xl border p-3.5" data-testid="selected-college">
      <span className="tone-chip tone-teal flex size-10 shrink-0 items-center justify-center rounded-lg">
        <Landmark className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-heading leading-snug font-bold break-words">{college.name}</p>
        {collegeLocation(college) && (
          <p className="text-muted-foreground mt-0.5 flex items-center gap-1 text-sm">
            <MapPin className="size-3.5 shrink-0" aria-hidden="true" /> {collegeLocation(college)}
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <ListingBadge status={college.listing_status} />
        </div>
        {note && (
          <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
            Choosing a college only connects your profile to it. It does not verify that you study or work there.
          </p>
        )}
      </div>
      <Button type="button" variant="ghost" size="sm" onClick={onClear} disabled={disabled} aria-label={`Remove ${college.name} from your profile`}>
        <X /> <span className="hidden sm:inline">Change</span>
      </Button>
    </div>
  );
}

export function AddCollegeForm({ initialName = "", onCancel, onPicked }) {
  const [name, setName] = useState(initialName);
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [country, setCountry] = useState("");
  const [website, setWebsite] = useState("");
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [candidates, setCandidates] = useState(null);
  const [pending, startTransition] = useTransition();
  const submitting = useRef(false);

  function submit(force = false) {
    // One request at a time: a double tap must never create two records.
    if (submitting.current) return;
    submitting.current = true;
    setError(null);
    setFieldErrors({});
    startTransition(async () => {
      try {
        const res = await createCollegeAction({ name, city, state, country, website, force });
        if (!res.ok) {
          setError(res.error);
          setFieldErrors(res.fieldErrors ?? {});
          return;
        }
        if (res.status === "similar") {
          setCandidates(res.candidates ?? []);
          return;
        }
        onPicked(res.college, res.status === "existing");
      } finally {
        submitting.current = false;
      }
    });
  }

  if (candidates) {
    return (
      <div className="bg-sunken rounded-xl p-4" role="group" aria-label="Is it one of these colleges?">
        <p className="font-heading font-bold">Is it one of these?</p>
        <p className="text-muted-foreground mt-1 text-sm">These look close to &ldquo;{name}&rdquo;. Using an existing one keeps the directory tidy.</p>
        <ul className="mt-3 space-y-2">
          {candidates.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onPicked(c, true)}
                className="bg-card hover:border-foreground/50 flex min-h-12 w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors"
              >
                <Landmark className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{c.name}</span>
                  {collegeLocation(c) && <span className="text-muted-foreground block text-xs">{collegeLocation(c)}</span>}
                </span>
                <span className="text-blue-text text-sm font-bold">Use this</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => submit(true)} disabled={pending}>
            {pending && <Loader2 className="animate-spin" />} No, mine is different: add it
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setCandidates(null)} disabled={pending}>
            Back
          </Button>
        </div>
        {error && <p role="alert" className="text-destructive-text mt-3 text-sm">{error}</p>}
      </div>
    );
  }

  const fe = (k) => fieldErrors[k];
  return (
    // A <div>, not a <form>: this panel lives inside other forms (profile, onboarding), and forms cannot nest.
    <div
      role="form"
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target.tagName === "INPUT") {
          e.preventDefault();
          if (name.trim().length >= 3) submit(false);
        }
      }}
      className="bg-sunken space-y-3 rounded-xl p-4"
      aria-label="Add a college"
    >
      <div>
        <p className="font-heading font-bold">Add your college</p>
        <p className="text-muted-foreground mt-1 text-sm">
          Only the name is needed. It will be listed as community-added until someone checks it, and anyone can suggest corrections.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="new-college-name" className="text-[13px] font-semibold">College name</Label>
        <Input id="new-college-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={160} aria-invalid={Boolean(fe("name"))} aria-describedby={fe("name") ? "new-college-name-err" : undefined} autoComplete="off" />
        {fe("name") && <p id="new-college-name-err" role="alert" className="text-destructive-text text-xs font-medium">{fe("name")}</p>}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="new-college-city" className="text-[13px] font-semibold">City <span className="text-muted-foreground font-normal">(optional)</span></Label>
          <Input id="new-college-city" value={city} onChange={(e) => setCity(e.target.value)} maxLength={80} autoComplete="off" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-college-state" className="text-[13px] font-semibold">State <span className="text-muted-foreground font-normal">(optional)</span></Label>
          <Input id="new-college-state" value={state} onChange={(e) => setState(e.target.value)} maxLength={80} autoComplete="off" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-college-country" className="text-[13px] font-semibold">Country <span className="text-muted-foreground font-normal">(optional)</span></Label>
          <Input id="new-college-country" value={country} onChange={(e) => setCountry(e.target.value)} maxLength={80} autoComplete="off" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="new-college-website" className="text-[13px] font-semibold">Website <span className="text-muted-foreground font-normal">(optional)</span></Label>
        <Input id="new-college-website" type="url" inputMode="url" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" maxLength={300} aria-invalid={Boolean(fe("website"))} />
        {fe("website") && <p role="alert" className="text-destructive-text text-xs font-medium">{fe("website")}</p>}
      </div>
      {error && <p role="alert" className="text-destructive-text text-sm font-medium">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={() => submit(false)} disabled={pending || name.trim().length < 3}>
          {pending ? <Loader2 className="animate-spin" /> : <Plus />} Add this college
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/**
 * Autocomplete college selector.
 *  - searches the directory as you type (debounced, one request in flight, stale answers dropped);
 *  - lists name + city/state/country and whether the listing is community-added or verified;
 *  - lets you add a college by name when it is not listed, with duplicate protection on the server;
 *  - fully keyboard and screen-reader operable (combobox pattern), with touch-sized options.
 *
 * `value` is a college summary or null; `onChange(college | null)`.
 */
export function CollegePicker({ value, onChange, id = "college", label = "College", optional = true, disabled = false, error, autoFocus = false, allowAdd = true, excludeId = null, note = true, placeholder = "Start typing the name of your college" }) {
  const listId = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState("idle"); // idle | loading | ready | error
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [adding, setAdding] = useState(false);
  const cache = useRef(new Map());
  const abort = useRef(null);
  const wrapper = useRef(null);
  const trimmed = query.trim();

  const run = useCallback(async (q) => {
    const key = q.toLowerCase();
    // The same text is never fetched twice in a session.
    if (cache.current.has(key)) {
      setResults(cache.current.get(key));
      setStatus("ready");
      return;
    }
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setStatus("loading");
    try {
      const res = await fetch(`/api/colleges/search?q=${encodeURIComponent(q)}`, { signal: controller.signal, headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(String(res.status));
      const json = await res.json();
      cache.current.set(key, json.results ?? []);
      setResults(json.results ?? []);
      setStatus("ready");
    } catch (e) {
      if (e?.name === "AbortError") return; // superseded by a newer keystroke
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    if (trimmed.length < MIN_CHARS) {
      abort.current?.abort();
      return;
    }
    const timer = setTimeout(() => run(trimmed), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [trimmed, run]);

  useEffect(() => {
    function onDocPointer(e) {
      if (wrapper.current && !wrapper.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("pointerdown", onDocPointer);
    return () => document.removeEventListener("pointerdown", onDocPointer);
  }, []);

  const exact = results.some((r) => r.name.trim().toLowerCase() === trimmed.toLowerCase());
  const canAdd = allowAdd && trimmed.length >= 3 && status !== "loading" && !exact;
  const visible = trimmed.length >= MIN_CHARS ? results.filter((r) => r.id !== excludeId) : [];
  const optionCount = visible.length + (canAdd ? 1 : 0);

  function pick(college) {
    onChange(college);
    setQuery("");
    setResults([]);
    setOpen(false);
    setActive(-1);
    setAdding(false);
  }

  function onKeyDown(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => (optionCount === 0 ? -1 : (a + 1) % optionCount));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => (optionCount === 0 ? -1 : (a <= 0 ? optionCount - 1 : a - 1)));
    } else if (e.key === "Home" && open) {
      e.preventDefault();
      setActive(optionCount ? 0 : -1);
    } else if (e.key === "End" && open) {
      e.preventDefault();
      setActive(optionCount - 1);
    } else if (e.key === "Enter") {
      e.preventDefault(); // this input sits inside the profile / onboarding form: Enter picks, it never submits that form
      if (open && active >= 0) {
        if (active < visible.length) pick(visible[active]);
        else setAdding(true);
      } else if (open && canAdd && visible.length === 0 && status === "ready") {
        setAdding(true);
      }
    } else if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        setOpen(false);
      }
    }
  }

  if (value) {
    return (
      <div>
        <Label htmlFor={`${id}-selected`} className="sr-only">{label}</Label>
        <SelectedCollege college={value} onClear={() => onChange(null)} disabled={disabled} note={note} />
      </div>
    );
  }

  if (adding) {
    return (
      <AddCollegeForm
        initialName={trimmed}
        onCancel={() => setAdding(false)}
        onPicked={(college) => pick(college)}
      />
    );
  }

  const showList = open && trimmed.length >= MIN_CHARS;
  return (
    <div ref={wrapper} className="relative">
      <Label htmlFor={id} className="text-[13px] font-semibold">
        {label} {optional && <span className="text-muted-foreground font-normal">(optional)</span>}
      </Label>
      <div className="relative mt-1.5">
        <Search aria-hidden="true" className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input
          id={id}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && active >= 0 ? `${listId}-opt-${active}` : undefined}
          aria-invalid={Boolean(error)}
          autoComplete="off"
          autoCapitalize="words"
          spellCheck={false}
          enterKeyHint="search"
          autoFocus={autoFocus}
          disabled={disabled}
          value={query}
          placeholder={placeholder}
          className="pr-9 pl-9"
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        {status === "loading" && <Loader2 aria-hidden="true" className="text-muted-foreground absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin" />}
      </div>
      {error && <p role="alert" className="text-destructive-text mt-1.5 text-xs font-medium">{error}</p>}

      <p className="sr-only" role="status" aria-live="polite">
        {status === "loading" ? "Searching colleges" : status === "error" ? "Search is unavailable" : trimmed.length >= MIN_CHARS && status === "ready" ? `${visible.length} ${visible.length === 1 ? "college" : "colleges"} found` : ""}
      </p>

      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Matching colleges"
          className="bg-popover absolute z-30 mt-1.5 max-h-80 w-full overflow-y-auto rounded-xl border p-1.5 shadow-[var(--shadow-pop)]"
        >
          {status === "error" && (
            <li role="presentation" className="px-3 py-3 text-sm">
              <p className="text-destructive-text font-medium">We could not search just now.</p>
              <button type="button" className="text-blue-text mt-1 font-bold underline-offset-2 hover:underline" onClick={() => run(trimmed)}>
                Try again
              </button>
            </li>
          )}
          {status === "loading" && visible.length === 0 && (
            <li role="presentation" className="text-muted-foreground px-3 py-3 text-sm">Searching…</li>
          )}
          {status === "ready" && visible.length === 0 && (
            <li role="presentation" className="text-muted-foreground px-3 py-3 text-sm">
              No college matches &ldquo;{trimmed}&rdquo; yet.
            </li>
          )}
          {visible.map((c, i) => (
            <li
              key={c.id}
              id={`${listId}-opt-${i}`}
              role="option"
              aria-selected={active === i}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => pick(c)}
              onMouseEnter={() => setActive(i)}
              className={cn("flex min-h-12 cursor-pointer items-center gap-3 rounded-lg px-3 py-2", active === i ? "bg-accent" : "hover:bg-accent/60")}
            >
              <GraduationCap className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold break-words">{c.name}</span>
                <span className="text-muted-foreground block text-xs">
                  {[collegeLocation(c), c.matched_alias ? `also known as ${c.matched_alias}` : null].filter(Boolean).join(" · ") || "Location not added"}
                  {Number(c.member_count) > 0 && ` · ${Number(c.member_count).toLocaleString()} ${Number(c.member_count) === 1 ? "member" : "members"}`}
                </span>
              </span>
              <ListingBadge status={c.listing_status} className="shrink-0" />
            </li>
          ))}
          {canAdd && (
            <li
              id={`${listId}-opt-${visible.length}`}
              role="option"
              aria-selected={active === visible.length}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => setAdding(true)}
              onMouseEnter={() => setActive(visible.length)}
              className={cn("border-border mt-1 flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border-t px-3 py-2 pt-3", active === visible.length ? "bg-accent" : "hover:bg-accent/60")}
            >
              <Plus className="text-teal-text size-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1 text-sm font-semibold">
                Add &ldquo;{trimmed}&rdquo; as a new college
              </span>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
