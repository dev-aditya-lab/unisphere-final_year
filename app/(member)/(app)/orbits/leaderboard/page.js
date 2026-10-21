import Link from "next/link";
import { CircleAlert } from "@/components/icons/lucide-compat";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/orbits/cards";
import { BoardRows } from "@/components/orbits/leaderboard-list";
import { ShareCardButton } from "@/components/orbits/share-card";
import { requireProfile } from "@/lib/auth/session";
import { getLeaderboard, getMyRank } from "@/lib/services/orbits";
import { buildCardSpec } from "@/lib/orbits/card-spec";
import { PERIODS, SCOPES } from "@/lib/orbits/icons";
import { publicEnv } from "@/lib/env-public";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Orbit Leaderboard" };
const PAGE = 20;

function href(scope, period, page = 1) {
  const q = new URLSearchParams({ scope, period });
  if (page > 1) q.set("page", String(page));
  return `/orbits/leaderboard?${q}`;
}

function Tabs({ label, items, current, make }) {
  return (
    <nav aria-label={label} className="bg-muted flex rounded-xl p-1">
      {items.map((i) => (
        <Link key={i.value} href={make(i.value)} aria-current={current === i.value ? "true" : undefined} scroll={false}
          className={cn("flex h-8 flex-1 items-center justify-center rounded-lg px-2 text-[13px] font-semibold whitespace-nowrap transition-colors", current === i.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}

export default async function LeaderboardPage({ searchParams }) {
  const { profile, user } = await requireProfile();
  const sp = await searchParams;
  const scope = SCOPES.some((s) => s.value === sp.scope) ? sp.scope : "global";
  const period = PERIODS.some((p) => p.value === sp.period) ? sp.period : "weekly";
  const page = Math.max(1, Math.min(200, Number(sp.page) || 1));
  const [board, me] = await Promise.all([getLeaderboard({ scope, period, page, limit: PAGE }), getMyRank(scope, period)]);
  const rows = board.data ?? [];
  const info = rows[0];
  const total = Number(info?.total ?? me.data?.total ?? 0);
  const myRank = me.data?.rank ? Number(me.data.rank) : null;
  const share = profile.orbits_cards_public;
  const cardUrl = share ? `${publicEnv.appUrl}/u/${profile.username}/orbits` : null;

  return (
    <>
      <PageHeader eyebrow="Orbits" title="Orbit Leaderboard" description="Ranked by Orbits earned in the period. Ties go to whoever reached the score first." />
      <div className="mb-4 grid gap-2 sm:grid-cols-2">
        <Tabs label="Leaderboard scope" items={SCOPES} current={scope} make={(v) => href(v, period)} />
        <Tabs label="Leaderboard period" items={PERIODS} current={period} make={(v) => href(scope, v)} />
      </div>

      {info?.in_progress && <p className="text-muted-foreground mb-3 text-xs">In progress: {formatDate(info.period_start)} to {formatDate(info.period_end)}. Ranks can still change.</p>}
      {scope === "college" && <p className="text-muted-foreground mb-3 text-xs">Colleges are self-reported by members and are not verified.</p>}

      {board.error || me.error ? (
        <div role="alert" className="surface flex flex-col items-center gap-3 px-6 py-12 text-center">
          <CircleAlert className="text-destructive-text size-7" aria-hidden="true" />
          <p className="font-semibold">The leaderboard could not be loaded.</p>
          <Button asChild variant="outline"><Link href={href(scope, period, page)}>Try again</Link></Button>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
          <Section aria-label="Rankings">
            {rows.length ? (
              <BoardRows rows={rows} meId={user.id} size={44} />
            ) : (
              <p className="text-muted-foreground py-10 text-center text-sm">
                {scope === "college" && !me.data?.has_college ? "Add your college in your profile to see this leaderboard." : scope === "connections" ? "Your connections appear here once they earn Orbits." : "Nobody has earned Orbits in this period yet."}
              </p>
            )}
            <nav aria-label="Pages" className="mt-3 flex items-center justify-between border-t pt-3 text-sm">
              {page > 1 ? <Link href={href(scope, period, page - 1)} className="text-primary-text font-semibold hover:underline">Previous</Link> : <span />}
              {rows.length === PAGE && page * PAGE < total ? <Link href={href(scope, period, page + 1)} className="text-primary-text font-semibold hover:underline">Next</Link> : <span />}
            </nav>
          </Section>

          <Section title="Your position" aria-label="Your position">
            {!me.data?.participating ? (
              <p className="text-muted-foreground text-sm">You are not on leaderboards. Change this in <Link href="/settings/privacy" className="text-primary-text font-semibold hover:underline">privacy settings</Link>.</p>
            ) : myRank ? (
              <div className="space-y-3">
                <p className="text-3xl font-extrabold">#{myRank}</p>
                <p className="text-muted-foreground text-sm">of {total.toLocaleString("en-IN")} · {Number(me.data.score).toLocaleString("en-IN")} Orbits</p>
                <ShareCardButton
                  label="Share this rank"
                  filename={`orbit-rank-${scope}-${period}`}
                  url={cardUrl}
                  spec={buildCardSpec({ kind: "rank", rank: myRank, scope, period, score: Number(me.data.score), name: share ? profile.full_name : null, username: share ? profile.username : null, url: cardUrl })}
                />
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">Earn your first Orbits in this period to appear on the board.</p>
            )}
            <p className="text-muted-foreground mt-3 border-t pt-3 text-xs">Your rank here is where you stand right now. Ranking badges are awarded only when an Orbit season is finalised.</p>
          </Section>
        </div>
      )}
    </>
  );
}
