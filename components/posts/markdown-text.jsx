import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ALLOWED_ELEMENTS, isExternal, safeHref } from "@/lib/markdown";
import { tokenizeRichText } from "@/lib/text";
import { cn } from "@/lib/utils";

const MAX_LINK_TEXT = 44;
const displayUrl = (value) => {
  const bare = value.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "");
  return bare.length > MAX_LINK_TEXT ? `${bare.slice(0, MAX_LINK_TEXT - 1)}…` : bare;
};

/** #hashtags and @mentions inside plain text become links, exactly as they always did. Addresses are handled by Markdown itself. */
function Rich({ children }) {
  const items = Array.isArray(children) ? children : [children];
  return (
    <>
      {items.map((child, n) => {
        if (typeof child !== "string") return child;
        return tokenizeRichText(child).map((t, i) => {
          const key = `${n}-${i}`;
          if (t.type === "hashtag") {
            return (
              <Link key={key} href={`/explore?tag=${encodeURIComponent(t.value)}`} className="text-primary-text rounded-sm font-medium hover:underline focus-visible:underline">
                #{t.value}
              </Link>
            );
          }
          if (t.type === "mention") {
            return (
              <Link prefetch={false} key={key} href={`/u/${t.value}`} className="text-primary-text bg-primary-soft hover:bg-primary-soft/70 rounded px-1 py-px font-medium focus-visible:underline">
                @{t.value}
              </Link>
            );
          }
          return t.raw ?? t.value;
        });
      })}
    </>
  );
}

const rich = (Tag, className) =>
  function RichElement({ children }) {
    return (
      <Tag className={className}>
        <Rich>{children}</Rich>
      </Tag>
    );
  };

const COMPONENTS = {
  p: rich("p", "[overflow-wrap:anywhere] whitespace-pre-wrap [&:not(:first-child)]:mt-3"),
  li: rich("li", "[overflow-wrap:anywhere] pl-0.5"),
  strong: rich("strong", "font-semibold"),
  em: rich("em", "italic"),
  del: rich("del", "line-through"),
  // headings are not a thing in a post: they read as a bold line, so a "# Title" never shouts above the author's own title
  h1: rich("p", "mt-3 font-semibold [overflow-wrap:anywhere] first:mt-0"),
  h2: rich("p", "mt-3 font-semibold [overflow-wrap:anywhere] first:mt-0"),
  h3: rich("p", "mt-3 font-semibold [overflow-wrap:anywhere] first:mt-0"),
  h4: rich("p", "mt-3 font-semibold [overflow-wrap:anywhere] first:mt-0"),
  h5: rich("p", "mt-3 font-semibold [overflow-wrap:anywhere] first:mt-0"),
  h6: rich("p", "mt-3 font-semibold [overflow-wrap:anywhere] first:mt-0"),
  ul: ({ node: _n, children }) => <ul className="mt-3 list-disc space-y-1 pl-5 first:mt-0">{children}</ul>,
  ol: ({ node: _n, children, start }) => (
    <ol start={start ?? undefined} className="mt-3 list-decimal space-y-1 pl-5 first:mt-0">
      {children}
    </ol>
  ),
  blockquote: ({ node: _n, children }) => <blockquote className="border-border-strong text-muted-foreground mt-3 border-l-[3px] pl-3 first:mt-0">{children}</blockquote>,
  hr: () => <hr className="my-4 border-t" />,
  pre: ({ node: _n, children }) => <pre className="bg-muted mt-3 max-w-full overflow-x-auto rounded-lg border p-3 text-[13px] leading-relaxed first:mt-0">{children}</pre>,
  code: ({ node: _n, className, children }) => <code className={cn("font-mono", className)}>{children}</code>,
  // A link is only a link when its address is http(s) or mailto (checked again here, whatever the parser did); anything else is text.
  a: ({ node: _n, href, children }) => {
    const safe = safeHref(href ?? "");
    if (!safe) return <span>{children}</span>;
    const text = Array.isArray(children) ? children : [children];
    // a bare address shows in its short, readable form; a written label is left as the author wrote it
    const label = text.length === 1 && typeof text[0] === "string" && text[0] === safe && isExternal(safe) ? displayUrl(safe) : children;
    return (
      <a href={safe} target={isExternal(safe) ? "_blank" : undefined} rel="noopener noreferrer nofollow ugc" title={safe} className="text-primary-text decoration-primary/40 hover:decoration-primary underline underline-offset-2">
        {label}
      </a>
    );
  },
};

/**
 * Renders a post, comment or caption as Markdown, safely. Bold, italic, strikethrough, lists, quotes, inline code and code blocks,
 * links and paragraph breaks work; single line breaks are kept (people write posts as plain lines); #hashtags and @mentions are links as
 * before. Raw HTML is shown as text, images are not rendered, and only http(s) and mailto links are links. The composer's preview and the
 * published post both use this component, so what you preview is what is published.
 */
export function MarkdownText({ text, className }) {
  const source = String(text ?? "");
  if (!source.trim()) return null;
  return (
    <div className={cn("[overflow-wrap:anywhere]", className)} data-markdown>
      <ReactMarkdown remarkPlugins={[remarkGfm]} allowedElements={ALLOWED_ELEMENTS} unwrapDisallowed urlTransform={(url) => safeHref(url)} components={COMPONENTS}>
        {source}
      </ReactMarkdown>
    </div>
  );
}
