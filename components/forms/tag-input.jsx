"use client";

import { useId, useMemo, useState } from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useSkillCatalog } from "@/lib/client/skill-catalog";
import { cn } from "@/lib/utils";

const ALL = "__suggested__";
const CHIPS_SHOWN = 24;

/**
 * Free-form tag entry. Enter or comma commits the current text; Backspace on an empty
 * field removes the last tag. Optional `suggestions` render as one-click chips.
 *
 * `catalog="skill" | "interest"` adds the managed list (Admin -> Skills): category buttons to browse it, and as the member
 * types, the listed names that match. The catalog only suggests; anything typed is still accepted.
 */
export function TagInput({ value = [], onChange, placeholder = "Type and press Enter", max = 30, suggestions = [], catalog = null, id, label, className }) {
  const [text, setText] = useState("");
  const [category, setCategory] = useState(ALL);
  const autoId = useId();
  const inputId = id ?? autoId;
  const listed = useSkillCatalog(catalog);

  function commit(raw) {
    const tag = raw.trim().replace(/\s+/g, " ").slice(0, 40);
    if (!tag) return;
    if (value.length >= max) return;
    if (value.some((v) => v.toLowerCase() === tag.toLowerCase())) {
      setText("");
      return;
    }
    onChange([...value, tag]);
    setText("");
  }

  function remove(tag) {
    onChange(value.filter((v) => v !== tag));
  }

  const chosen = useMemo(() => new Set(value.map((v) => v.toLowerCase())), [value]);
  const categories = useMemo(() => [...new Set(listed.map((i) => i.category))].sort((a, b) => a.localeCompare(b)), [listed]);

  const shown = useMemo(() => {
    const unused = (name) => !chosen.has(name.toLowerCase());
    if (listed.length === 0) return suggestions.filter(unused).slice(0, 12);
    const q = text.trim().toLowerCase();
    if (q) {
      const starts = listed.filter((i) => unused(i.name) && i.name.toLowerCase().startsWith(q));
      const contains = listed.filter((i) => unused(i.name) && !i.name.toLowerCase().startsWith(q) && i.name.toLowerCase().includes(q));
      return [...starts, ...contains].slice(0, CHIPS_SHOWN).map((i) => i.name);
    }
    if (category !== ALL) return listed.filter((i) => i.category === category && unused(i.name)).slice(0, 60).map((i) => i.name);
    // Before anything is picked, a few from every category show how wide the list is.
    const perCategory = new Map();
    for (const i of listed) {
      if (!unused(i.name)) continue;
      const list = perCategory.get(i.category) ?? [];
      if (list.length < 2) list.push(i.name);
      perCategory.set(i.category, list);
    }
    return [...perCategory.values()].flat().slice(0, CHIPS_SHOWN);
  }, [listed, suggestions, chosen, text, category]);

  return (
    <div className={cn("space-y-2", className)}>
      <div
        className={cn(
          "border-input bg-card focus-within:border-ring focus-within:ring-ring/40 flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border px-2 py-1.5 focus-within:ring-[3px]",
        )}
      >
        {value.map((tag) => (
          <Badge key={tag} variant="soft" className="gap-1 py-1 pr-1 pl-2 text-xs">
            {tag}
            <button
              type="button"
              onClick={() => remove(tag)}
              aria-label={`Remove ${tag}`}
              className="hover:bg-primary/15 rounded p-0.5"
            >
              <X className="size-3" />
            </button>
          </Badge>
        ))}
        <input
          id={inputId}
          aria-label={label}
          value={text}
          disabled={value.length >= max}
          onChange={(e) => {
            const v = e.target.value;
            if (v.endsWith(",")) commit(v.slice(0, -1));
            else setText(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit(text);
            } else if (e.key === "Backspace" && text === "" && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
          onBlur={() => commit(text)}
          placeholder={value.length ? "" : placeholder}
          className="placeholder:text-muted-foreground min-w-[8ch] flex-1 bg-transparent px-1 py-0.5 text-sm outline-none disabled:cursor-not-allowed"
        />
      </div>
      {categories.length > 1 && value.length < max && (
        <div role="group" aria-label={`${label ?? "Suggestion"} categories`} className="scrollbar-none -mx-1 flex gap-1 overflow-x-auto px-1 pb-0.5">
          {[ALL, ...categories].map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              aria-pressed={category === c}
              className={cn(
                "shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap transition-colors",
                category === c ? "border-primary/40 bg-primary-soft text-primary-text" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {c === ALL ? "Suggested" : c}
            </button>
          ))}
        </div>
      )}
      {shown.length > 0 && value.length < max && (
        <div className="flex flex-wrap gap-1.5" aria-label="Suggestions">
          {shown.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => commit(s)}
              onMouseDown={(e) => e.preventDefault() /* keep the text field focused, so choosing a suggestion does not commit half-typed text */}
              className="border-border text-muted-foreground hover:border-primary/40 hover:text-foreground rounded-md border px-2 py-0.5 text-xs transition-colors"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
