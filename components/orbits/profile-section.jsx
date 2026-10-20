import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { RewardIcon } from "@/components/orbits/reward-icon";
import { getProfileSummary } from "@/lib/services/orbits";
import { formatDate } from "@/lib/format";

/**
 * Orbits on a member's profile. Everything shown is what the database function allows this viewer to see: the owner's
 * privacy choices (balance, badges and streak) are enforced there, so hidden values simply are not returned.
 */
export async function OrbitsProfileSection({ username }) {
  const { data: s, error } = await getProfileSummary(username);
  if (error || !s) return null;
  if (s.balance == null && s.achievements == null) return null;
  const shown = (s.achievements ?? []).slice(0, 6);

  return (
    <section className="surface p-5" aria-labelledby="orbits-title">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id="orbits-title" className="eyebrow flex items-center gap-2">Orbits</h2>
        <Link href={`/u/${s.user.username}/orbits`} className="text-primary-text inline-flex items-center gap-1 text-sm font-semibold hover:underline">
          Achievement history <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {s.balance != null && (
          <div className="flex items-center gap-2.5">
            <RewardIcon name="orbit" size={44} alt="Orbits" />
            <div>
              <p className="text-xl leading-none font-extrabold tabular-nums">{s.balance.toLocaleString("en-IN")}</p>
              <p className="text-muted-foreground text-xs">Orbit Balance</p>
            </div>
          </div>
        )}
        {s.streak && (
          <div className="flex items-center gap-2.5">
            <RewardIcon name="flame" size={44} alt="Streak" />
            <div>
              <p className="text-xl leading-none font-extrabold tabular-nums">{s.streak.current}</p>
              <p className="text-muted-foreground text-xs">Current streak · best {s.streak.best}</p>
            </div>
          </div>
        )}
      </div>
      {shown.length > 0 ? (
        <ul className="mt-4 flex flex-wrap gap-3" aria-label="Orbit Badges">
          {shown.map((a) => (
            <li key={`${a.id}-${a.earned_at}`} className="flex w-20 flex-col items-center gap-1 text-center" title={`${a.title}${a.period ? ` · ${a.period}` : ""} · ${formatDate(a.earned_at)}`}>
              <RewardIcon name={a.icon} imageKey={a.image_key} rank={a.rank >= 1 && a.rank <= 10 ? a.rank : undefined} size={56} alt={a.title} />
              <span className="text-[11px] leading-tight font-semibold">{a.title}</span>
            </li>
          ))}
        </ul>
      ) : (
        s.achievements != null && <p className="text-muted-foreground mt-3 text-sm">No badges yet.</p>
      )}
    </section>
  );
}
