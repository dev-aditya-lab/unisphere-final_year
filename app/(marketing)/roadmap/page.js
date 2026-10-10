import Link from "next/link";
import { Button } from "@/components/ui/button";
import { areaLabel } from "@/lib/feedback-meta";
import { getRoadmap } from "@/lib/services/feedback";

export const metadata = {
  title: "Roadmap",
  description: "What the UniSphere team is building, what is planned next and what has shipped. Ideas come from RGEC members and are ordered by their votes.",
  alternates: { canonical: "/roadmap" },
};
export const revalidate = 300;

const COLUMNS = [
  { status: "in_progress", title: "In progress", blurb: "Being built right now." },
  { status: "planned", title: "Planned next", blurb: "Agreed, not started yet." },
  { status: "shipped", title: "Recently shipped", blurb: "Live for everyone." },
];

export default async function RoadmapPage() {
  const items = await getRoadmap();
  return (
    <article className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
      <p className="eyebrow mb-2">Roadmap</p>
      <h1 className="text-4xl font-extrabold sm:text-5xl">What we are building</h1>
      <p className="text-muted-foreground mt-4 max-w-2xl text-lg">
        Most of this list started as an idea from a member. It is not a promise or a schedule, and it changes as we learn. Have something to add? Suggest it inside UniSphere and vote on what you want most.
      </p>
      <div className="mt-10 grid gap-6 md:grid-cols-3">
        {COLUMNS.map((col) => {
          const list = items.filter((i) => i.status === col.status);
          return (
            <section key={col.status} aria-labelledby={`col-${col.status}`}>
              <h2 id={`col-${col.status}`} className="font-heading text-lg font-bold">{col.title} <span className="text-muted-foreground text-sm font-normal">({list.length})</span></h2>
              <p className="text-muted-foreground mb-3 text-sm">{col.blurb}</p>
              {list.length === 0 ? (
                <p className="surface text-muted-foreground p-4 text-sm">Nothing here yet.</p>
              ) : (
                <ul className="space-y-3">
                  {list.map((i) => (
                    <li key={i.id} className="surface p-4">
                      <p className="font-semibold">{i.title}</p>
                      {i.public_response && <p className="text-muted-foreground mt-1 text-sm">{i.public_response}</p>}
                      <p className="text-muted-foreground mt-2 text-xs">
                        {areaLabel(i.area)} · {i.vote_count} vote{i.vote_count === 1 ? "" : "s"}{i.version ? ` · shipped in v${i.version}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
      <div className="mt-12 flex flex-wrap gap-3">
        <Button asChild size="lg"><Link href="/feedback">Suggest or vote on ideas</Link></Button>
        <Button asChild size="lg" variant="outline"><Link href="/changelog">See what already shipped</Link></Button>
      </div>
    </article>
  );
}
