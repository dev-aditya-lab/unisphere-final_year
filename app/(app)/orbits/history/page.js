import Link from "next/link";
import { CircleAlert } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { ActivityList, Section } from "@/components/orbits/cards";
import { requireProfile } from "@/lib/auth/session";
import { getLedgerPage } from "@/lib/services/orbits";

export const metadata = { title: "Orbit history" };

export default async function HistoryPage({ searchParams }) {
  await requireProfile();
  const page = Math.max(1, Math.min(500, Number((await searchParams).page) || 1));
  const { rows, hasMore, error } = await getLedgerPage({ page });
  return (
    <>
      <PageHeader eyebrow="Orbits" title="Orbit history" description="Every Orbit you earned or that was taken back, newest first. Learning, contribution and streak rewards are labelled separately." />
      {error ? (
        <div role="alert" className="surface flex flex-col items-center gap-3 px-6 py-12 text-center">
          <CircleAlert className="text-destructive-text size-7" aria-hidden="true" />
          <p className="font-semibold">Your history could not be loaded.</p>
          <Button asChild variant="outline"><Link href={`/orbits/history?page=${page}`}>Try again</Link></Button>
        </div>
      ) : (
        <Section aria-label="Ledger">
          <ActivityList rows={rows} empty="Nothing here yet. Claim your Daily Orbit Bonus or answer today's challenge." />
          <nav aria-label="Pages" className="mt-3 flex items-center justify-between border-t pt-3 text-sm">
            {page > 1 ? <Link href={`/orbits/history?page=${page - 1}`} className="text-primary-text font-semibold hover:underline">Newer</Link> : <span />}
            {hasMore ? <Link href={`/orbits/history?page=${page + 1}`} className="text-primary-text font-semibold hover:underline">Older</Link> : <span />}
          </nav>
        </Section>
      )}
    </>
  );
}
