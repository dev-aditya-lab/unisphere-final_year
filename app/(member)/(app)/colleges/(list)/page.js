import Link from "next/link";
import { Landmark, MapPin, Search } from "@/components/icons/lucide-compat";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { AddCollegeButton } from "@/components/colleges/college-actions";
import { ListingBadge, collegeLocation } from "@/components/colleges/listing";
import { Button } from "@/components/ui/button";
import { requireProfile } from "@/lib/auth/session";
import { listCollegeDirectory } from "@/lib/services/colleges";

export const metadata = { title: "Colleges", robots: { index: false, follow: false } };

const PAGE = 24;

export default async function CollegesPage({ searchParams }) {
  const { profile } = await requireProfile();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";
  const page = Math.max(1, Number.parseInt(typeof sp.page === "string" ? sp.page : "1", 10) || 1);
  const { items, total } = await listCollegeDirectory({ q: q || null, page, pageSize: PAGE });
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const href = (p) => `/colleges?${new URLSearchParams({ ...(q ? { q } : {}), ...(p > 1 ? { page: String(p) } : {}) }).toString()}`;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        eyebrow="Directory"
        title="Colleges"
        description="A directory members build together. Connecting a college to your profile only says you chose it; it does not verify that you study or work there."
        actions={<AddCollegeButton />}
      />

      <form action="/colleges" role="search" className="mb-6">
        <label htmlFor="college-q" className="sr-only">Search colleges</label>
        <div className="relative">
          <Search aria-hidden="true" className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <input
            id="college-q"
            name="q"
            defaultValue={q}
            type="search"
            enterKeyHint="search"
            placeholder="Search by name, short name or city"
            className="border-input bg-card placeholder:text-faint hover:border-foreground/40 focus-visible:border-ring focus-visible:ring-ring/35 h-11 w-full rounded-lg border pr-3 pl-9 text-sm outline-none focus-visible:ring-[3px]"
          />
        </div>
      </form>

      {items.length === 0 ? (
        <EmptyState
          icon={Landmark}
          title={q ? `No college matches “${q}”` : "No colleges listed yet"}
          action={<AddCollegeButton />}
        >
          {q ? "Check the spelling, or add it yourself. It takes a few seconds and only needs a name." : "Be the first to add yours."}
        </EmptyState>
      ) : (
        <>
          <p className="text-muted-foreground mb-3 text-sm" aria-live="polite">
            {total.toLocaleString()} {total === 1 ? "college" : "colleges"}
            {q ? ` matching “${q}”` : ""}
          </p>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {items.map((c) => (
              <li key={c.id}>
                <Link href={`/colleges/${c.slug}`} className="surface hover:border-foreground/50 flex h-full items-start gap-3 p-4 transition-colors">
                  <span className="tone-chip tone-teal flex size-10 shrink-0 items-center justify-center rounded-lg">
                    <Landmark className="size-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="font-heading block leading-snug font-bold break-words">{c.name}</span>
                    {collegeLocation(c) && (
                      <span className="text-muted-foreground mt-0.5 flex items-center gap-1 text-sm">
                        <MapPin className="size-3.5 shrink-0" aria-hidden="true" /> {collegeLocation(c)}
                      </span>
                    )}
                    <span className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <ListingBadge status={c.listing_status} />
                      <span className="text-muted-foreground">
                        {Number(c.member_count).toLocaleString()} {Number(c.member_count) === 1 ? "member" : "members"}
                      </span>
                      {profile.college_id === c.id && <span className="text-teal-text font-bold">Your college</span>}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {pages > 1 && (
            <nav aria-label="Pages" className="mt-6 flex items-center justify-between">
              <Button asChild variant="outline" size="sm" aria-disabled={page <= 1} className={page <= 1 ? "pointer-events-none opacity-50" : ""}>
                <Link href={href(page - 1)}>Previous</Link>
              </Button>
              <span className="text-muted-foreground text-sm">Page {page} of {pages}</span>
              <Button asChild variant="outline" size="sm" aria-disabled={page >= pages} className={page >= pages ? "pointer-events-none opacity-50" : ""}>
                <Link href={href(page + 1)}>Next</Link>
              </Button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
