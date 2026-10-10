"use client";

import { useId, useState } from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Free-form tag entry. Enter or comma commits the current text; Backspace on an empty
 * field removes the last tag. Optional `suggestions` render as one-click chips.
 */
export function TagInput({ value = [], onChange, placeholder = "Type and press Enter", max = 30, suggestions = [], id, label, className }) {
  const [text, setText] = useState("");
  const autoId = useId();
  const inputId = id ?? autoId;

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

  const unusedSuggestions = suggestions.filter((s) => !value.some((v) => v.toLowerCase() === s.toLowerCase()));

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
      {unusedSuggestions.length > 0 && value.length < max && (
        <div className="flex flex-wrap gap-1.5" aria-label="Suggestions">
          {unusedSuggestions.slice(0, 12).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => commit(s)}
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
