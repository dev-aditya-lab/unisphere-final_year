import Link from "next/link";
import { tokenizeRichText } from "@/lib/text";
import { cn } from "@/lib/utils";

/**
 * Renders user text safely: everything is a React text node (escaped), with #hashtags,
 * @mentions and links turned into real anchors. External links are marked ugc/nofollow.
 */
export function RichText({ text, className }) {
  const tokens = tokenizeRichText(text);
  return (
    <p className={cn("break-words whitespace-pre-wrap", className)}>
      {tokens.map((t, i) => {
        if (t.type === "hashtag") {
          return (
            <Link key={i} href={`/explore?tag=${encodeURIComponent(t.value)}`} className="text-primary font-medium hover:underline">
              #{t.value}
            </Link>
          );
        }
        if (t.type === "mention") {
          return (
            <Link key={i} href={`/u/${t.value}`} className="text-primary font-medium hover:underline">
              @{t.value}
            </Link>
          );
        }
        if (t.type === "url") {
          return (
            <a key={i} href={t.value} target="_blank" rel="noopener noreferrer nofollow ugc" className="text-primary break-all underline underline-offset-2">
              {t.value}
            </a>
          );
        }
        return <span key={i}>{t.value}</span>;
      })}
    </p>
  );
}
