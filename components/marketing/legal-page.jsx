import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { LEGAL_UPDATED } from "@/lib/content/legal";

/**
 * Renders a policy page from either an administrator-supplied Markdown override
 * (rendered without raw HTML, so it cannot inject markup) or the built-in sections.
 */
export function LegalPage({ eyebrow, title, intro, sections, markdown }) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-14 sm:px-6 sm:py-20">
      <p className="eyebrow mb-2">{eyebrow}</p>
      <h1 className="text-4xl font-extrabold">{title}</h1>
      {intro && <p className="text-muted-foreground mt-4 text-lg">{intro}</p>}
      {!markdown && <p className="text-muted-foreground mt-2 text-sm">Last updated {LEGAL_UPDATED}</p>}

      <div className="prose-uni mt-8">
        {markdown ? (
          <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
            {markdown}
          </ReactMarkdown>
        ) : (
          sections.map((s) => (
            <section key={s.heading}>
              <h2>{s.heading}</h2>
              {s.body?.map((p) => <p key={p.slice(0, 40)}>{p}</p>)}
              {s.list && (
                <ul>
                  {s.list.map((li) => (
                    <li key={li.slice(0, 40)}>{li}</li>
                  ))}
                </ul>
              )}
            </section>
          ))
        )}
      </div>
    </article>
  );
}
