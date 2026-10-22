"use client";

import { useId, useRef, useState, useSyncExternalStore } from "react";
import { Bold, Code, Eye, Italic, Link2, List, ListOrdered, Pencil, Quote } from "lucide-react";
import { toast } from "sonner";
import { SuggestTextarea } from "@/components/posts/suggest-textarea";
import { MarkdownText } from "@/components/posts/markdown-text";
import { shortcutFor } from "@/lib/markdown-edit";
import { cn } from "@/lib/utils";

const noop = () => () => {};
// the shortcut hint says Ctrl or ⌘ for this device (and "Ctrl+" while rendering on the server, so hydration matches)
const useModifier = () => useSyncExternalStore(noop, () => (/Mac|iPhone|iPad/.test(navigator.platform ?? "") ? "⌘" : "Ctrl+"), () => "Ctrl+");
const TOOLS = [
  { kind: "bold", label: "Bold", icon: Bold, hint: (m) => `${m}B` },
  { kind: "italic", label: "Italic", icon: Italic, hint: (m) => `${m}I` },
  { kind: "ul", label: "Bulleted list", icon: List },
  { kind: "ol", label: "Numbered list", icon: ListOrdered },
  { kind: "quote", label: "Quote", icon: Quote },
  { kind: "code", label: "Code", icon: Code },
  { kind: "link", label: "Link", icon: Link2, hint: (m) => `${m}K` },
];

/**
 * The post text box with a Markdown toolbar and a preview. The buttons keep the textarea focused (so the on-screen keyboard stays up on
 * a phone and the selection survives), edit the selected words in place, and put the selection back afterwards. The preview is the same
 * component the published post uses, so it shows exactly what will be posted. Everything stays plain text until it is published.
 */
export function MarkdownEditor({ ref, value, onChange, previewClassName, maxLength, onKeyDown, ...props }) {
  const inner = useRef(null);
  const [preview, setPreview] = useState(false);
  const toolbarId = useId();
  const MOD = useModifier();

  // forward the textarea's own API (focus, insertTrigger) and add format()
  function setRef(node) {
    inner.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) ref.current = node;
  }

  function format(kind) {
    if (!inner.current?.format(kind)) toast.error("That would go over the length limit.");
  }

  return (
    <div>
      <div role="toolbar" aria-label="Formatting" aria-controls={props.id} id={toolbarId} className="scrollbar-none -mx-1 mb-1 flex items-center gap-0.5 overflow-x-auto px-1">
        {TOOLS.map(({ kind, label, icon: Icon, hint }) => {
          const tip = hint ? `${label} (${hint(MOD)})` : label;
          return (
            <button
              key={kind}
              type="button"
              title={tip}
              aria-label={label}
              disabled={preview}
              // mousedown would move focus (and on a phone close the keyboard) before the click lands
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => format(kind)}
              className="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring/45 grid size-9 shrink-0 place-items-center rounded-lg outline-none focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-40"
            >
              <Icon className="size-[18px]" aria-hidden="true" />
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setPreview((p) => !p)}
          aria-pressed={preview}
          title={preview ? "Back to writing" : "Preview how it will look"}
          className={cn(
            "focus-visible:ring-ring/45 ml-auto flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold outline-none focus-visible:ring-[3px]",
            preview ? "bg-primary-soft text-primary-text" : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          {preview ? <Pencil className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
          {preview ? "Edit" : "Preview"}
        </button>
      </div>

      {/* hidden, not removed: the text, the selection and the undo history stay where they were */}
      <div hidden={preview}>
        <SuggestTextarea
          {...props}
          ref={setRef}
          value={value}
          onChange={onChange}
          maxLength={maxLength}
          onKeyDown={(e) => {
            const kind = shortcutFor(e);
            if (kind && !e.nativeEvent.isComposing) {
              e.preventDefault();
              format(kind);
              return;
            }
            onKeyDown?.(e);
          }}
        />
      </div>
      {preview && (
        <div className="min-h-36 py-1" aria-live="polite" data-testid="markdown-preview">
          {value.trim() ? <MarkdownText text={value} className={previewClassName} /> : <p className="text-muted-foreground text-sm">Nothing to preview yet.</p>}
        </div>
      )}
    </div>
  );
}
