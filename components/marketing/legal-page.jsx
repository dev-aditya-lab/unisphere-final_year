import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { LEGAL_UPDATED } from "@/lib/content/legal";

const LINK = /\[([^\]]+)\]\((\/[^)\s]*|mailto:[^)\s]+)\)/g;

/** Turns `[label](/internal-path)` and `[label](mailto:address)` in built-in policy text into real links. Nothing else is linked. */
function Inline({ text }) {
  const parts = [];
  let last = 0;
  for (const m of text.matchAll(LINK)) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(
      m[2].startsWith("mailto:") ? (
        <a key={`${m.index}-${m[2]}`} href={m[2]}>
          {m[1]}
        </a>
      ) : (
        <Link key={`${m.index}-${m[2]}`} href={m[2]}>
          {m[1]}
        </Link>
      ),
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

/**
 * Renders a policy page from either an administrator-supplied Markdown override
 * (rendered without raw HTML, so it cannot inject markup) or the built-in sections.
 */
export function LegalPage({ eyebrow, title, intro, sections, markdown, updated = LEGAL_UPDATED, children }) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-14 sm:px-6 sm:py-20">
      <p className="eyebrow mb-2">{eyebrow}</p>
      <h1 className="text-4xl font-extrabold">{title}</h1>
      {intro && <p className="text-muted-foreground mt-4 text-lg">{intro}</p>}
      {!markdown && <p className="text-muted-foreground mt-2 text-sm">Last updated {updated}</p>}

      <div className="prose-uni mt-8">
        {markdown ? (
          <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
            {markdown}
          </ReactMarkdown>
        ) : (
          sections.map((s) => (
            <section key={s.heading}>
              <h2>{s.heading}</h2>
              {s.body?.map((p) => (
                <p key={p.slice(0, 40)}>
                  <Inline text={p} />
                </p>
              ))}
              {s.list && (
                <ul>
                  {s.list.map((li) => (
                    <li key={li.slice(0, 40)}>
                      <Inline text={li} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))
        )}
      </div>
      {children}
    </article>
  );
}
