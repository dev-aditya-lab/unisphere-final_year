import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { FilterTabs } from "@/components/admin/ui";
import { FeedbackForm } from "@/components/feedback/feedback-form";
import { IdeaVote } from "@/components/feedback/idea-vote";
import { Badge } from "@/components/ui/badge";
import { requireProfile } from "@/lib/auth/session";
import { FEEDBACK_AREAS, FEEDBACK_KINDS, FEEDBACK_STATUS, areaLabel } from "@/lib/feedback-meta";
import { listIdeas, listMine } from "@/lib/services/feedback";
import { timeAgo } from "@/lib/format";

export const metadata = { title: "Feedback & ideas" };

const TABS = [
  { value: "ideas", label: "Ideas board" },
  { value: "mine", label: "My submissions" },
];

function StatusPill({ status }) {
  const s = FEEDBACK_STATUS[status] ?? FEEDBACK_STATUS.new;
  return <Badge variant={s.tone}>{s.label}</Badge>;
}

export default async function FeedbackPage({ searchParams }) {
  const sp = await searchParams;
  const { profile } = await requireProfile();
  const tab = TABS.some((t) => t.value === sp.tab) ? sp.tab : "ideas";
  const sort = sp.sort === "new" ? "new" : "top";
  const status = sp.show === "shipped" ? "shipped" : "open";
  const area = FEEDBACK_AREAS.some((a) => a.value === sp.area) ? sp.area : null;
  const initialKind = FEEDBACK_KINDS.some((k) => k.value === sp.kind) ? sp.kind : "feature";
  // Only a site-relative path may be attached to a report.
  const from = typeof sp.from === "string" && sp.from.startsWith("/") && !sp.from.startsWith("//") ? sp.from.slice(0, 200) : null;

  const [ideas, mine] = await Promise.all([tab === "ideas" ? listIdeas({ sort, area, status }) : [], tab === "mine" ? listMine(profile.id) : []]);

  return (
    <>
      <PageHeader
        eyebrow="Help shape UniSphere" title="Feedback & ideas"
        description="Report a bug, suggest a feature, or vote on what to build next. See what is coming on the public roadmap."
        actions={<><Link href="/roadmap" className="text-primary text-sm font-semibold hover:underline">Roadmap</Link><Link href="/changelog" className="text-primary text-sm font-semibold hover:underline">What&rsquo;s new</Link></>}
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
        <div>
          <FilterTabs label="Feedback views" basePath="/feedback" param="tab" current={tab} options={TABS} />
          {tab === "ideas" ? (
            <>
              <form method="get" className="mb-4 flex flex-wrap items-end gap-3 text-[13px]" aria-label="Filter ideas">
                <label><span className="text-muted-foreground mb-1 block text-xs font-medium">Show</span>
                  <select name="show" defaultValue={status} className="border-input bg-card h-9 rounded-md border px-2 text-sm"><option value="open">Open ideas</option><option value="shipped">Shipped</option></select></label>
                <label><span className="text-muted-foreground mb-1 block text-xs font-medium">Sort</span>
                  <select name="sort" defaultValue={sort} className="border-input bg-card h-9 rounded-md border px-2 text-sm"><option value="top">Most votes</option><option value="new">Newest</option></select></label>
                <label><span className="text-muted-foreground mb-1 block text-xs font-medium">Area</span>
                  <select name="area" defaultValue={area ?? ""} className="border-input bg-card h-9 rounded-md border px-2 text-sm"><option value="">All areas</option>{FEEDBACK_AREAS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}</select></label>
                <button className="border-input hover:bg-muted h-9 rounded-md border px-3 text-sm">Apply</button>
              </form>
              {ideas.length === 0 ? (
                <div className="surface text-muted-foreground p-8 text-center text-sm">No ideas here yet. Be the first to suggest one.</div>
              ) : (
                <ul className="space-y-3">
                  {ideas.map((i) => (
                    <li key={i.id} className="surface flex gap-3 p-4">
                      <IdeaVote id={i.id} voted={i.voted} count={i.vote_count} disabled={i.status === "shipped" || i.status === "declined"} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-heading font-bold">{i.title}</h3>
                          <StatusPill status={i.status} />
                        </div>
                        <p className="text-muted-foreground mt-1 text-sm break-words whitespace-pre-wrap">{i.body}</p>
                        {i.public_response && (
                          <p className="bg-accent/50 mt-2 rounded-md px-3 py-2 text-[13px]"><strong>Team:</strong> {i.public_response}</p>
                        )}
                        <p className="text-muted-foreground mt-2 text-xs">{i.firstName} · {areaLabel(i.area)} · <time dateTime={i.created_at} suppressHydrationWarning>{timeAgo(i.created_at)}</time></p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : mine.length === 0 ? (
            <div className="surface text-muted-foreground p-8 text-center text-sm">You have not sent anything yet.</div>
          ) : (
            <ul className="space-y-3">
              {mine.map((i) => (
                <li key={i.id} className="surface p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{FEEDBACK_KINDS.find((k) => k.value === i.kind)?.short}</Badge>
                    <h3 className="font-heading font-bold">{i.title}</h3>
                    <StatusPill status={i.status} />
                  </div>
                  {i.public_response && <p className="bg-accent/50 mt-2 rounded-md px-3 py-2 text-[13px]"><strong>Team:</strong> {i.public_response}</p>}
                  <p className="text-muted-foreground mt-2 text-xs">Sent <time dateTime={i.created_at} suppressHydrationWarning>{timeAgo(i.created_at)}</time>{i.kind === "feature" ? ` · ${i.vote_count} vote${i.vote_count === 1 ? "" : "s"}` : ""}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
        <aside>
          <FeedbackForm initialKind={initialKind} fromPath={from} />
        </aside>
      </div>
    </>
  );
}
