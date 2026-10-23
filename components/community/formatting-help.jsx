"use client";

import { CircleHelp } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const ROWS = [
  ["**bold**", "bold"],
  ["*italic*", "italic"],
  ["~~gone~~", "strikethrough"],
  ["`code`", "inline code"],
  ["- item", "bulleted list"],
  ["1. item", "numbered list"],
  ["> quote", "quote"],
  ["[text](https://…)", "link (http and https only)"],
  ["@username", "mention someone"],
];

/** A short reminder of what formatting messages understand, in a popover that opens with Enter or Space and closes with Escape. */
export function FormattingHelp({ className }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" aria-label="Formatting help" className={className ?? "text-muted-foreground hover:text-foreground focus-visible:ring-ring/45 grid size-9 shrink-0 place-items-center rounded-lg outline-none focus-visible:ring-[3px]"}>
          <CircleHelp className="size-[18px]" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 text-sm">
        <p className="mb-2 font-semibold">Formatting</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          {ROWS.map(([syntax, meaning]) => (
            <div key={syntax} className="contents">
              <dt><code className="bg-muted rounded px-1 font-mono text-xs">{syntax}</code></dt>
              <dd className="text-muted-foreground">{meaning}</dd>
            </div>
          ))}
        </dl>
        <p className="text-muted-foreground mt-2 text-xs">Raw HTML, images and scripts are never run: they appear as plain text. Press Shift+Enter for a new line.</p>
      </PopoverContent>
    </Popover>
  );
}
