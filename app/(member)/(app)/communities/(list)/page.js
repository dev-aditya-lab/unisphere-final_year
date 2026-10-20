import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus, Users } from "lucide-react";
import { OfficialBadge } from "@/components/campus/community-parts";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireProfile } from "@/lib/auth/session";
import { listCommunities } from "@/lib/services/campus";
import { isFlagEnabled } from "@/lib/settings";
import { COMMUNITY_KINDS } from "@/lib/validators/campus";
import { cn } from "@/lib/utils";

export const metadata = { title: "Communities", robots: { index: false, follow: false } };
const selectCls = "border-input bg-card focus-visible:border-ring focus-visible:ring-ring/40 h-9 rounded-md border px-2.5 text-sm outline-none focus-visible:ring-[3px]";

export default async function CommunitiesPage({ searchParams }) {
  if (!(await isFlagEnabled("communities"))) notFound();
  const { user } = await requireProfile();
  const sp = await searchParams;
  const mine = sp.tab === "mine";
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 80) : "";
  const kind = COMMUNITY_KINDS.some((k) => k.value === sp.kind) ? sp.kind : null;
  const list = await listCommunities({ query: q || null, kind, mine, userId: user.id });

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader eyebrow="Campus" title="Clubs & communities" description="Join student chapters, clubs and interest groups. Official college groups carry a badge."
        actions={<Button asChild variant="hot"><Link href="/communities/new"><Plus /> New community</Link></Button>} />
      <nav aria-label="Community lists" className="mb-5 flex gap-1 border-b">
        {[["all", "Discover"], ["mine", "My communities"]].map(([id, label]) => (
          <Link key={id} href={id === "mine" ? "/communities?tab=mine" : "/communities"} aria-current={(id === "mine") === mine ? "page" : undefined}
            className={cn("relative px-3 py-2.5 text-sm font-medium", (id === "mine") === mine ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
            {label}{(id === "mine") === mine && <span aria-hidden="true" className="bg-primary absolute inset-x-3 -bottom-px h-0.5 rounded-full" />}
          </Link>
        ))}
      </nav>
      <form method="get" action="/communities" role="search" className="surface mb-5 flex flex-wrap gap-2 p-3">
        {mine && <input type="hidden" name="tab" value="mine" />}
        <label htmlFor="c-q" className="sr-only">Search communities</label>
        <input id="c-q" name="q" defaultValue={q} placeholder="Search communities" maxLength={80} className="border-input bg-card focus-visible:border-ring focus-visible:ring-ring/40 h-9 min-w-48 flex-1 rounded-md border px-3 text-sm outline-none focus-visible:ring-[3px]" />
        <select name="kind" defaultValue={kind ?? ""} className={selectCls} aria-label="Type"><option value="">All types</option>{COMMUNITY_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</select>
        <Button type="submit">Filter</Button>
      </form>
      {list.length === 0 ? (
        <EmptyState icon={Users} title={mine ? "You have not joined any community" : "No communities found"} action={<Button asChild><Link href="/communities/new">Start one</Link></Button>}>
          {mine ? "Browse Discover to find clubs and groups to join." : "Be the first to create a club or interest group for your campus."}
        </EmptyState>
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {list.map((c) => (
            <li key={c.id}>
              <article className="surface h-full p-4 sm:p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="mono">{COMMUNITY_KINDS.find((k) => k.value === c.kind)?.label}</Badge>
                  {c.is_official && <OfficialBadge />}
                  {c.my_status === "active" && <Badge variant="success">Joined</Badge>}
                  {c.my_status === "pending" && <Badge variant="warning">Requested</Badge>}
                </div>
                <h2 className="font-heading mt-2 text-lg font-bold"><Link href={`/communities/${c.slug}`} className="hover:underline">{c.name}</Link></h2>
                {c.description && <p className="text-muted-foreground mt-1 line-clamp-2 text-sm">{c.description}</p>}
                <p className="text-muted-foreground mt-3 flex items-center gap-1 text-xs"><Users className="size-3.5" aria-hidden="true" />{c.member_count} member{c.member_count === 1 ? "" : "s"}</p>
              </article>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
