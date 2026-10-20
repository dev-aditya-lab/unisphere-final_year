import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { RewardIcon } from "@/components/orbits/reward-icon";
import { Section } from "@/components/orbits/cards";
import { ShareCardButton } from "@/components/orbits/share-card";
import { UserAvatar } from "@/components/user-avatar";
import { getProfileSummary } from "@/lib/services/orbits";
import { buildCardSpec } from "@/lib/orbits/card-spec";
import { publicEnv } from "@/lib/env-public";
import { formatDate } from "@/lib/format";
import { USERNAME_REGEX } from "@/lib/constants";

export const metadata = { title: "Orbit achievements", robots: { index: false, follow: false } };

/**
 * A member's Orbit achievements: the page an Orbit Card links to. It is for signed-in members and honours the owner's
 * choices: a hidden balance, hidden badges or disabled cards are not sent by the database at all.
 */
export default async function MemberOrbitsPage({ params }) {
  const { username } = await params;
  if (!USERNAME_REGEX.test(username)) notFound();
  const { data: s } = await getProfileSummary(username);
  if (!s) notFound();
  const list = s.achievements ?? [];
  const url = `${publicEnv.appUrl}/u/${s.user.username}/orbits`;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href={`/u/${s.user.username}`} className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm">
        <ArrowLeft className="size-4" aria-hidden="true" /> {s.user.full_name}
      </Link>
      <PageHeader eyebrow="Orbits" title="Orbit achievements" description={`${s.user.full_name} · @${s.user.username}`} />
      <Section className="flex flex-wrap items-center gap-6">
        <UserAvatar name={s.user.full_name} avatarKey={s.user.avatar_key} size="lg" />
        {s.balance != null && (
          <div className="flex items-center gap-2">
            <RewardIcon name="orbit" size={48} alt="Orbits" />
            <div>
              <p className="text-2xl leading-none font-extrabold tabular-nums">{s.balance.toLocaleString("en-IN")}</p>
              <p className="text-muted-foreground text-xs">Orbit Balance</p>
            </div>
          </div>
        )}
        {s.streak && (
          <div className="flex items-center gap-2">
            <RewardIcon name="flame" size={48} alt="Streak" />
            <div>
              <p className="text-2xl leading-none font-extrabold">{s.streak.current}</p>
              <p className="text-muted-foreground text-xs">Current streak · best {s.streak.best}</p>
            </div>
          </div>
        )}
      </Section>
      {s.achievements == null ? (
        <p className="text-muted-foreground text-sm">This member keeps their badges private.</p>
      ) : list.length === 0 ? (
        <p className="text-muted-foreground text-sm">No badges yet.</p>
      ) : (
        <Section title="Orbit Badges">
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {list.map((a) => (
              <li key={`${a.id}-${a.earned_at}`} className="bg-card flex flex-col items-center gap-2 rounded-2xl border p-4 text-center">
                <RewardIcon name={a.icon} rank={a.rank >= 1 && a.rank <= 10 ? a.rank : undefined} size={72} alt={a.title} />
                <p className="text-sm font-bold">{a.title}</p>
                <p className="text-muted-foreground text-xs">
                  {formatDate(a.earned_at)}
                  {a.period ? ` · ${a.period}` : ""}
                  {a.rank ? ` · rank ${a.rank}` : ""}
                </p>
                {s.self && s.cards_public && (
                  <ShareCardButton
                    label="Share"
                    size="xs"
                    variant="ghost"
                    filename={`orbit-${a.id}`}
                    url={url}
                    spec={buildCardSpec({ kind: a.id.startsWith("streak_") ? "streak" : "achievement", days: Number(a.id.split("_")[1]), title: a.title, icon: a.icon, scope: a.scope, period: a.period, rank: a.rank, name: s.user.full_name, username: s.user.username, url })}
                  />
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
