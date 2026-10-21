import Link from "next/link";
import { CircleAlert } from "@/components/icons/lucide-compat";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/orbits/cards";
import { RewardIcon } from "@/components/orbits/reward-icon";
import { requireProfile } from "@/lib/auth/session";
import { getLearningHistory } from "@/lib/services/orbits";
import { CATEGORY_LABEL } from "@/lib/orbits/icons";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Learning history" };
const PAGE = 10;

export default async function LearningPage({ searchParams }) {
  await requireProfile();
  const page = Math.max(1, Math.min(200, Number((await searchParams).page) || 1));
  const res = await getLearningHistory({ page, limit: PAGE });
  const rows = res.data ?? [];
  const total = Number(rows[0]?.total_count ?? 0);
  const correct = rows.filter((r) => r.is_correct).length;

  return (
    <>
      <PageHeader eyebrow="Orbits" title="Learning history" description="The Daily Challenge questions you have answered, with the explanation. Only questions you answered are listed here." />
      {res.error ? (
        <div role="alert" className="surface flex flex-col items-center gap-3 px-6 py-12 text-center">
          <CircleAlert className="text-destructive-text size-7" aria-hidden="true" />
          <p className="font-semibold">Your learning history could not be loaded.</p>
          <Button asChild variant="outline"><Link href="/orbits/learning">Try again</Link></Button>
        </div>
      ) : rows.length === 0 ? (
        <Section>
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <RewardIcon name="brain" size={80} />
            <p className="font-semibold">No answered questions yet.</p>
            <p className="text-muted-foreground max-w-sm text-sm">Answer today&rsquo;s challenge and it will appear here with its explanation.</p>
            <Button asChild><Link href="/orbits">Go to today&rsquo;s challenge</Link></Button>
          </div>
        </Section>
      ) : (
        <div className="space-y-3">
          <p className="text-muted-foreground text-sm">{total} answered · {correct} correct on this page</p>
          {rows.map((r) => (
            <Section key={r.question_id} aria-label={r.question}>
              <div className="flex items-start gap-3">
                <RewardIcon name={r.is_correct ? "circle-check" : "circle-x"} size={36} alt={r.is_correct ? "Correct" : "Incorrect"} />
                <div className="min-w-0 flex-1">
                  <p className="text-muted-foreground text-xs">{CATEGORY_LABEL[r.category] ?? r.category} · {formatDate(r.publish_date)}{r.earned ? ` · +${r.earned} Orbits` : ""}</p>
                  <p className="mt-0.5 font-semibold">{r.question}</p>
                  <ul className="mt-2 space-y-1 text-sm">
                    {r.options.map((o, i) => (
                      <li key={i} className={cn("rounded-lg px-2.5 py-1.5", i === r.correct_index && "bg-success-soft text-success-text font-semibold", i === r.selected && i !== r.correct_index && "bg-destructive-soft text-destructive-text")}>
                        {"ABCD"[i]}. {o}
                        {i === r.correct_index ? " · correct answer" : ""}
                        {i === r.selected ? " · your answer" : ""}
                      </li>
                    ))}
                  </ul>
                  <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{r.explanation}</p>
                </div>
              </div>
            </Section>
          ))}
          <nav aria-label="Pages" className="flex items-center justify-between text-sm">
            {page > 1 ? <Link href={`/orbits/learning?page=${page - 1}`} className="text-primary-text font-semibold hover:underline">Newer</Link> : <span />}
            {page * PAGE < total ? <Link href={`/orbits/learning?page=${page + 1}`} className="text-primary-text font-semibold hover:underline">Older</Link> : <span />}
          </nav>
        </div>
      )}
    </>
  );
}
