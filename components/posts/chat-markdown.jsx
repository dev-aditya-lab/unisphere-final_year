"use client";

import { memo } from "react";
import { MarkdownText } from "@/components/posts/markdown-text";
import { isCheapToRender } from "@/lib/markdown";
import { cn } from "@/lib/utils";

/**
 * A chat message (direct or community) as Markdown, with the same safe rules as posts: raw HTML is text, images are not rendered,
 * only http(s) and mailto links are links, and nothing is ever set as HTML. Memoised on the text, so an unrelated change in the
 * conversation (a keystroke, a new message) does not parse every visible message again. A message that would be expensive to parse
 * is shown as the plain text it is (lib/markdown.js, isCheapToRender).
 */
export const ChatMarkdown = memo(function ChatMarkdown({ text, className }) {
  if (!isCheapToRender(text)) return <p className={cn("[overflow-wrap:anywhere] whitespace-pre-wrap", className)}>{text}</p>;
  return <MarkdownText text={text} className={cn("text-sm [&_p:not(:first-child)]:mt-1.5", className)} />;
});
