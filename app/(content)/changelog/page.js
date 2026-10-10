import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { RELEASE_KINDS } from "@/lib/feedback-meta";
import { listReleases } from "@/lib/services/feedback";

export const metadata = {
  title: "Changelog",
  description: "Release notes for UniSphere, the campus network of Ramgarh Engineering College: what is new, improved and fixed in every version.",
};

const TONE = { new: "success", improved: "soft", fixed: "warning", security: "danger" };
const label = (k) => RELEASE_KINDS.find((x) => x.value === k)?.label ?? k;

export default async function ChangelogPage() {
  const releases = await listReleases();
  return (
    <article className="mx-auto max-w-3xl py-2">
      <p className="eyebrow mb-2">Changelog</p>
      <h1 className="text-4xl font-extrabold sm:text-5xl">What&rsquo;s new</h1>
      <p className="text-muted-foreground mt-4 text-lg">Every release, newest first. See what we are working on next on the <Link href="/roadmap" className="text-blue-text font-semibold hover:underline">roadmap</Link>.</p>
      {releases.length === 0 ? (
        <p className="surface text-muted-foreground mt-10 p-6 text-sm">No releases published yet.</p>
      ) : (
        <ol className="mt-12 space-y-12">
          {releases.map((r) => (
            <li key={r.id} id={`v${r.version}`} className="scroll-mt-24">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="font-heading text-2xl font-extrabold">{r.title}</h2>
                <span className="text-muted-foreground font-mono text-sm">v{r.version}</span>
                <time dateTime={r.published_at} className="text-muted-foreground text-sm">{new Intl.DateTimeFormat("en-IN", { dateStyle: "long", timeZone: "Asia/Kolkata" }).format(new Date(r.published_at))}</time>
              </div>
              {r.summary && <p className="text-muted-foreground mt-1">{r.summary}</p>}
              <ul className="mt-4 space-y-2.5">
                {r.items.map((it, i) => (
                  <li key={i} className="flex items-start gap-3 text-[15px]">
                    <Badge variant={TONE[it.kind] ?? "mono"} className="mt-0.5 w-20 justify-center">{label(it.kind)}</Badge>
                    <span className="min-w-0 flex-1">{it.text}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}
