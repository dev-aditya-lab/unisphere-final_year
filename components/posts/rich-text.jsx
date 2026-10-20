import Link from "next/link";
import { tokenizeRichText } from "@/lib/text";
import { cn } from "@/lib/utils";

const MAX_LINK_TEXT = 44;

/** A readable form of a URL for the page: no scheme, no "www.", no trailing slash, cut at a sensible length. */
function displayUrl(value) {
  const bare = value.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "");
  return bare.length > MAX_LINK_TEXT ? `${bare.slice(0, MAX_LINK_TEXT - 1)}…` : bare;
}

/**
 * Renders user text safely: everything is a React text node (escaped), with #hashtags,
 * @mentions and links turned into real anchors. External links are marked ugc/nofollow and only ever http(s)
 * (see tokenizeRichText). Hashtags are plain indigo, mentions sit on a soft indigo tint, links are underlined, so the
 * three read differently without relying on colour alone. Long words and URLs wrap instead of widening the card.
 */
export function RichText({ text, className }) {
  const tokens = tokenizeRichText(text);
  return (
    <p className={cn("[overflow-wrap:anywhere] whitespace-pre-wrap", className)}>
      {tokens.map((t, i) => {
        if (t.type === "hashtag") {
          return (
            <Link key={i} href={`/explore?tag=${encodeURIComponent(t.value)}`} className="text-primary-text rounded-sm font-medium hover:underline focus-visible:underline">
              #{t.value}
            </Link>
          );
        }
        if (t.type === "mention") {
          return (
            <Link
              prefetch={false}
              key={i}
              href={`/u/${t.value}`}
              className="text-primary-text bg-primary-soft hover:bg-primary-soft/70 rounded px-1 py-px font-medium focus-visible:underline"
            >
              @{t.value}
            </Link>
          );
        }
        if (t.type === "url") {
          return (
            <a
              key={i}
              href={t.value}
              target="_blank"
              rel="noopener noreferrer nofollow ugc"
              title={t.value}
              className="text-primary-text decoration-primary/40 hover:decoration-primary underline underline-offset-2"
            >
              {displayUrl(t.value)}
            </a>
          );
        }
        return <span key={i}>{t.value}</span>;
      })}
    </p>
  );
}
