import Link from "next/link";
import { CircleAlert } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { AchievementTile, Section } from "@/components/orbits/cards";
import { ShareCardButton } from "@/components/orbits/share-card";
import { requireProfile } from "@/lib/auth/session";
import { getAchievements } from "@/lib/services/orbits";
import { buildCardSpec } from "@/lib/orbits/card-spec";
import { publicEnv } from "@/lib/env-public";

export const metadata = { title: "Orbit Badges" };

const GROUPS = [
  ["ranking", "Orbit Elite"],
  ["streak", "Orbit Streak"],
  ["learning", "Learning"],
  ["contribution", "Contribution"],
  ["collaboration", "Collaboration"],
  ["orbits", "Orbit milestones"],
];

function specFor(a, e, profile, url) {
  const who = profile.orbits_cards_public ? { name: profile.full_name, username: profile.username } : {};
  if (a.category === "streak") return buildCardSpec({ kind: "streak", days: a.target, imageKey: a.image_key, url, ...who });
  if (a.category === "ranking") return buildCardSpec({ kind: "achievement", title: a.title, icon: a.icon, imageKey: a.image_key, scope: e.scope, period: e.period, rank: e.rank, url, ...who });
  return buildCardSpec({ kind: "achievement", title: a.title, icon: a.icon, imageKey: a.image_key, url, ...who });
}

export default async function AchievementsPage() {
  const { profile } = await requireProfile();
  const res = await getAchievements();
  if (res.error) {
    return (
      <>
        <PageHeader eyebrow="Orbits" title="Orbit Badges" />
        <div role="alert" className="surface flex flex-col items-center gap-3 px-6 py-12 text-center">
          <CircleAlert className="text-destructive-text size-7" aria-hidden="true" />
          <p className="font-semibold">Your badges could not be loaded.</p>
          <Button asChild variant="outline"><Link href="/orbits/achievements">Try again</Link></Button>
        </div>
      </>
    );
  }
  const all = res.data;
  const earnedCount = all.filter((a) => a.earned.length > 0).length;
  const url = profile.orbits_cards_public ? `${publicEnv.appUrl}/u/${profile.username}/orbits` : null;

  return (
    <>
      <PageHeader eyebrow="Orbits" title="Orbit Badges" description={`${earnedCount} of ${all.length} earned. Badges come from what you actually did: they are never handed out for a temporary position on a leaderboard.`} />
      <div className="space-y-6">
        {GROUPS.map(([id, label]) => {
          const items = all.filter((a) => a.category === id);
          if (!items.length) return null;
          return (
            <Section key={id} title={label} aria-label={label}>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {items.flatMap((a) => (a.earned.length ? a.earned.map((e) => ({ a, e })) : [{ a, e: null }])).map(({ a, e }) => (
                  <AchievementTile key={`${a.id}-${e?.earned_at ?? "locked"}`} a={e ? { ...a, earned: [e] } : a}>
                    {e && (
                      <ShareCardButton label="Share" size="xs" variant="ghost" filename={`orbit-${a.id}`} url={url} spec={specFor(a, e, profile, url)} />
                    )}
                  </AchievementTile>
                ))}
              </ul>
            </Section>
          );
        })}
      </div>
    </>
  );
}
