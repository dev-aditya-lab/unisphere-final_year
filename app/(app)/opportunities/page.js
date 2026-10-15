import Link from "next/link";
import { notFound } from "next/navigation";
import { Briefcase, MapPin, Plus } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireProfile } from "@/lib/auth/session";
import { listOpportunities } from "@/lib/services/campus";
import { isFlagEnabled } from "@/lib/settings";
import { formatDate } from "@/lib/format";
import { OPPORTUNITY_KINDS } from "@/lib/validators/campus";

export const metadata = { title: "Opportunities", robots: { index: false, follow: false } };
const selectCls = "border-input bg-card focus-visible:border-ring focus-visible:ring-ring/40 h-9 rounded-md border px-2.5 text-sm outline-none focus-visible:ring-[3px]";

export default async function OpportunitiesPage({ searchParams }) {
  if (!(await isFlagEnabled("opportunities"))) notFound();
  await requireProfile();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 80) : "";
  const kind = OPPORTUNITY_KINDS.some((k) => k.value === sp.kind) ? sp.kind : null;
  const mode = ["on_site", "remote", "hybrid"].includes(sp.mode) ? sp.mode : null;
  const skill = typeof sp.skill === "string" ? sp.skill.trim().slice(0, 40) : "";
  const openOnly = sp.closed !== "1";
  const list = await listOpportunities({ query: q || null, kind, mode, skill: skill || null, openOnly });

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader eyebrow="Campus" title="Opportunities" description="Internships, research, competitions and more, shared by your community. Applications happen on the organiser's own page."
        actions={<Button asChild variant="hot"><Link href="/opportunities/new"><Plus /> Share an opportunity</Link></Button>} />
      <form method="get" action="/opportunities" role="search" className="surface mb-5 flex flex-wrap items-center gap-2 p-3">
        <label htmlFor="o-q" className="sr-only">Search opportunities</label>
        <input id="o-q" name="q" defaultValue={q} placeholder="Search" maxLength={80} className="border-input bg-card focus-visible:border-ring focus-visible:ring-ring/40 h-9 min-w-44 flex-1 rounded-md border px-3 text-sm outline-none focus-visible:ring-[3px]" />
        <select name="kind" defaultValue={kind ?? ""} className={selectCls} aria-label="Type"><option value="">All types</option>{OPPORTUNITY_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</select>
        <select name="mode" defaultValue={mode ?? ""} className={selectCls} aria-label="Work mode"><option value="">Any mode</option><option value="on_site">On site</option><option value="remote">Remote</option><option value="hybrid">Hybrid</option></select>
        <input name="skill" defaultValue={skill} placeholder="Skill" maxLength={40} aria-label="Skill" className="border-input bg-card focus-visible:border-ring focus-visible:ring-ring/40 h-9 w-32 rounded-md border px-3 text-sm outline-none focus-visible:ring-[3px]" />
        <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="closed" value="1" defaultChecked={!openOnly} className="accent-[var(--primary)]" /> Include closed</label>
        <Button type="submit">Filter</Button>
      </form>
      {list.length === 0 ? (
        <EmptyState icon={Briefcase} title="No opportunities match" action={<Button asChild><Link href="/opportunities/new">Share one</Link></Button>}>Try fewer filters, or share an opportunity you know about.</EmptyState>
      ) : (
        <ul className="space-y-3">
          {list.map((o) => (
            <li key={o.id}>
              <article className="surface p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="soft">{OPPORTUNITY_KINDS.find((k) => k.value === o.kind)?.label}</Badge>
                  {o.status === "closed" && <Badge variant="mono">Closed</Badge>}
                  {o.deadline && <Badge variant="warning">Apply by {formatDate(o.deadline, { dateStyle: "medium", timeZone: "UTC" })}</Badge>}
                </div>
                <h2 className="font-heading mt-1.5 text-lg font-bold"><Link prefetch={false} href={`/opportunities/${o.slug}`} className="hover:underline">{o.title}</Link></h2>
                <p className="text-muted-foreground text-sm">{o.organization}{o.stipend ? ` · ${o.stipend}` : ""}</p>
                <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 text-xs">
                  {o.location && <span className="flex items-center gap-1"><MapPin className="size-3.5" aria-hidden="true" />{o.location}</span>}
                  <span className="capitalize">{o.mode.replace("_", " ")}</span>
                </p>
                {o.skills.length > 0 && <p className="mt-2 flex flex-wrap gap-1">{o.skills.slice(0, 6).map((s) => <Badge key={s} variant="mono" className="normal-case tracking-normal">{s}</Badge>)}</p>}
              </article>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
