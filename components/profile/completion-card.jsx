import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { profileCompletion } from "@/lib/profile-completion";

/** Transparent checklist: each missing item links to where it can be completed. */
export function CompletionCard({ profile }) {
  const { percent, items } = profileCompletion(profile);
  return (
    <section className="surface p-5 sm:p-6" aria-labelledby="completion-title">
      <div className="flex items-center justify-between gap-3">
        <h2 id="completion-title" className="text-lg font-bold">
          Profile completeness
        </h2>
        <span className="font-mono text-sm font-semibold">{percent}%</span>
      </div>
      <Progress value={percent} aria-label={`Profile ${percent}% complete`} className="mt-3 h-1.5" />
      <ul className="mt-4 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
        {items.map((i) => (
          <li key={i.key} className="flex items-center gap-2 text-sm">
            {i.complete ? (
              <CheckCircle2 className="text-success size-4 shrink-0" aria-label="Done" />
            ) : (
              <Circle className="text-muted-foreground size-4 shrink-0" aria-label="To do" />
            )}
            {i.complete ? (
              <span className="text-muted-foreground line-through decoration-1">{i.label}</span>
            ) : (
              <Link href={i.href} className="hover:text-primary font-medium underline-offset-2 hover:underline">
                {i.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
