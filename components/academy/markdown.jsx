import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

/**
 * Lesson and course text, written by Academy staff. Rendered without raw HTML (so nothing in it can add markup or script), with
 * links that leave the site opened safely and images limited to https addresses.
 */
export function Markdown({ children, className }) {
  if (!children) return null;
  return (
    <div className={cn("ac-prose", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          a: ({ href, children: c }) => {
            const external = /^https?:\/\//i.test(href ?? "");
            const safe = external || (href ?? "").startsWith("/") || (href ?? "").startsWith("#");
            return safe ? <a href={href} {...(external ? { target: "_blank", rel: "noopener noreferrer nofollow ugc" } : {})}>{c}</a> : <span>{c}</span>;
          },
          // eslint-disable-next-line @next/next/no-img-element
          img: ({ src, alt }) => (/^https:\/\//i.test(src ?? "") ? <img src={src} alt={alt ?? ""} loading="lazy" decoding="async" className="my-4 h-auto max-w-full rounded-lg" /> : null),
        }}
      >
        {String(children)}
      </ReactMarkdown>
    </div>
  );
}
