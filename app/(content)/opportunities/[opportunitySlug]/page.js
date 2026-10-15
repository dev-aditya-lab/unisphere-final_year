import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, MapPin } from "lucide-react";
import { OpportunityOwnerActions } from "@/components/campus/opportunity-parts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";
import { getAuthUser } from "@/lib/auth/session";
import { getOpportunityBySlug } from "@/lib/services/campus";
import { isFlagEnabled } from "@/lib/settings";
import { formatDate } from "@/lib/format";
import { isValidSlug } from "@/lib/slug";
import { excerpt } from "@/lib/text";
import { OPPORTUNITY_KINDS } from "@/lib/validators/campus";

export async function generateMetadata({ params }) {
  const { opportunitySlug } = await params;
  const o = isValidSlug(opportunitySlug) ? await getOpportunityBySlug(opportunitySlug) : null;
  if (!o) return { title: "Opportunity not found", robots: { index: false, follow: false } };
  const isPublic = false; // closed network: member content is never indexed or given a public preview
  return {
    title: `${o.title} at ${o.organization}`,
    description: excerpt(o.description || `${o.title} at ${o.organization}`, 160),
    alternates: { canonical: `/opportunities/${o.slug}` },
    robots: isPublic ? { index: true, follow: true } : { index: false, follow: false },
  };
}

export default async function OpportunityPage({ params }) {
  if (!(await isFlagEnabled("opportunities"))) notFound();
  const { opportunitySlug } = await params;
  if (!isValidSlug(opportunitySlug)) notFound();
  const o = await getOpportunityBySlug(opportunitySlug);
  if (!o) notFound();
  const user = await getAuthUser();
  const isOwner = user?.id === o.poster_id;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header className="surface p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="soft">{OPPORTUNITY_KINDS.find((k) => k.value === o.kind)?.label}</Badge>
          {o.status === "closed" && <Badge variant="mono">Closed</Badge>}
          {o.deadline && <Badge variant="warning">Apply by {formatDate(o.deadline, { dateStyle: "medium", timeZone: "UTC" })}</Badge>}
        </div>
        <h1 className="mt-2 text-2xl font-extrabold sm:text-3xl">{o.title}</h1>
        <p className="text-muted-foreground mt-1">{o.organization}{o.stipend ? ` · ${o.stipend}` : ""}</p>
        <p className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-4 text-sm">
          {o.location && <span className="flex items-center gap-1"><MapPin className="size-4" aria-hidden="true" />{o.location}</span>}
          <span className="capitalize">{o.mode.replace("_", " ")}</span>
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3 border-t pt-4">
          {o.apply_url && o.status === "open" && (user ? <Button asChild><a href={o.apply_url} target="_blank" rel="noopener noreferrer nofollow ugc">Apply on the organiser&rsquo;s site <ExternalLink /></a></Button> : <Button asChild><Link prefetch={false} href={`/login?next=/opportunities/${o.slug}`}>Log in to apply</Link></Button>)}
          {o.poster && <p className="flex items-center gap-2 text-sm"><UserAvatar name={o.poster.full_name} avatarKey={o.poster.avatar_key} size="xs" />Shared by <Link prefetch={false} href={`/u/${o.poster.username}`} className="font-semibold hover:underline">{o.poster.full_name}</Link></p>}
        </div>
      </header>
      {o.description && <section className="surface p-5"><h2 className="eyebrow mb-3">Details</h2><p className="text-[15px] leading-relaxed whitespace-pre-wrap">{o.description}</p></section>}
      {o.skills.length > 0 && <section className="surface p-5"><h2 className="eyebrow mb-3">Skills</h2><ul className="flex flex-wrap gap-1.5">{o.skills.map((s) => <li key={s}><Badge variant="soft" className="py-1 text-[13px]">{s}</Badge></li>)}</ul></section>}
      {isOwner && <OpportunityOwnerActions opportunity={o} />}
    </div>
  );
}
