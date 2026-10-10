import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { z } from "zod";
import { PageHeader } from "@/components/shell/page-header";
import { Panel, StatusBadge, fmtDateTime } from "@/components/admin/ui";
import { ReportActions } from "@/components/admin/report-actions";
import { hasPermission } from "@/lib/auth/session";
import { isFlagEnabled } from "@/lib/settings";
import { getReport } from "@/lib/services/admin";

export const metadata = { title: "Review report" };

const ACTION_LABEL = {
  warn: "Warned", remove_content: "Removed content", restore_content: "Restored content", restrict: "Restricted",
  suspend: "Suspended", reinstate: "Reinstated", dismiss: "Dismissed report", note: "Note",
};

function liveLink(report, target) {
  const s = report.snapshot ?? {};
  if (report.target_type === "post" && s.slug) return { href: `/${s.category === "ideas" ? "ideas" : "posts"}/${s.slug}`, label: "Open the post" };
  if (report.target_type === "comment" && s.post_slug) return { href: `/posts/${s.post_slug}#comments`, label: "Open the thread" };
  if (report.target_type === "user" && target?.username) return { href: `/u/${target.username}`, label: "Open the profile" };
  return null;
}

export default async function ReportDetailPage({ params }) {
  const { reportId } = await params;
  if (!z.uuid().safeParse(reportId).success) notFound();
  const d = await getReport(reportId);
  const { report, owner, target } = d;
  const college = report.college_id;

  const [canResolve, canWarn, canRemove, canRestrict, canSuspend, aiOn] = await Promise.all([
    hasPermission("reports.resolve", college), hasPermission("moderation.warn", college), hasPermission("content.remove", college),
    hasPermission("users.restrict", college), hasPermission("users.suspend", college), isFlagEnabled("ai_moderation_assist"),
  ]);
  const closed = report.status === "resolved" || report.status === "dismissed";
  const snapshot = report.snapshot ?? {};
  const link = liveLink(report, target);
  const ai = report.ai_suggestion;
  const contentRemoved = ["removed", "deleted"].includes(target?.status);

  return (
    <>
      <Link href="/admin/reports" className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1.5 text-sm">
        <ArrowLeft className="size-4" aria-hidden="true" /> All reports
      </Link>
      <PageHeader
        eyebrow={`Report · ${d.college_name ?? "No college"}`}
        title={`${report.target_type[0].toUpperCase()}${report.target_type.slice(1)} reported for ${report.category.replace(/_/g, " ")}`}
        description={`Filed ${fmtDateTime(report.created_at)}${d.same_target_reports ? ` · ${d.same_target_reports} other report(s) about the same thing` : ""}`}
        actions={
          <>
            <StatusBadge value={report.severity} />
            <StatusBadge value={report.status} />
          </>
        }
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-5">
          <Panel
            title="What was reported"
            description="A snapshot taken when the report was filed. Treat it as untrusted text."
            actions={link && (
              <Link href={link.href} target="_blank" className="text-blue-text inline-flex items-center gap-1 text-sm font-semibold hover:underline">
                {link.label} <ExternalLink className="size-3.5" aria-hidden="true" />
              </Link>
            )}
          >
            {contentRemoved && <p className="bg-muted mb-3 rounded-md px-3 py-2 text-[13px]">This {report.target_type} is currently removed or deleted.</p>}
            {snapshot.title && <p className="font-heading mb-1 font-bold">{snapshot.title}</p>}
            {(snapshot.full_name || snapshot.username) && (
              <p className="font-heading mb-1 font-bold">{snapshot.full_name} <span className="text-muted-foreground font-normal">@{snapshot.username}</span></p>
            )}
            {snapshot.headline && <p className="text-muted-foreground mb-2 text-sm">{snapshot.headline}</p>}
            <p className="bg-muted/50 rounded-md border p-3 text-sm break-words whitespace-pre-wrap">{snapshot.body ?? snapshot.bio ?? "(no text)"}</p>
            {report.details && (
              <div className="mt-4">
                <p className="eyebrow mb-1">Reporter&rsquo;s note</p>
                <p className="text-sm break-words whitespace-pre-wrap">{report.details}</p>
              </div>
            )}
            <p className="text-muted-foreground mt-3 text-xs">Reporter: {d.reporter_name ?? "removed account"}. Never reveal this to the reported member.</p>
          </Panel>

          <Panel title="AI triage suggestion" description="A second opinion for you to weigh. It never acts on its own.">
            {ai ? (
              <div className="text-sm">
                <p>
                  Suggests <strong className="capitalize">{ai.category?.replace(/_/g, " ")}</strong>, <strong>{ai.severity}</strong> severity
                  <span className="text-muted-foreground"> · {ai.confidence} confidence</span>
                </p>
                <p className="text-muted-foreground mt-1">{ai.rationale}</p>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">{aiOn ? "No suggestion yet." : "AI triage is switched off."}</p>
            )}
            {aiOn && !closed && canResolve && <ReportActions part="triage" reportId={report.id} hasSuggestion={Boolean(ai)} />}
          </Panel>

          <Panel title="History" description="Decisions and internal notes about this member and report. Notes are never shown to the member.">
            {d.history.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nothing yet.</p>
            ) : (
              <ol className="divide-y">
                {d.history.map((h) => (
                  <li key={h.id} className="py-2.5 text-sm">
                    <p>
                      <span className="font-semibold">{ACTION_LABEL[h.action] ?? h.action}</span>
                      <span className="text-muted-foreground"> · {h.actor ?? "staff"} · {fmtDateTime(h.created_at)}{h.report_id === report.id ? "" : " · earlier report"}</span>
                    </p>
                    {h.reason && <p className="text-muted-foreground mt-0.5 break-words whitespace-pre-wrap">{h.reason}</p>}
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>

        <aside className="space-y-5">
          <Panel title="Member">
            {owner?.id ? (
              <div className="text-sm">
                <p className="font-semibold">{owner.full_name}</p>
                <p className="text-muted-foreground">@{owner.username}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <StatusBadge value={owner.status} />
                  <StatusBadge value={owner.verification_status} />
                  {owner.protected && <StatusBadge value="protected" className="uppercase" />}
                </div>
                <p className="text-muted-foreground mt-2 text-xs">Joined {fmtDateTime(owner.created_at)}</p>
                <Link href={`/admin/users/${owner.id}`} className="text-blue-text mt-2 inline-block text-[13px] font-semibold hover:underline">
                  Open member record
                </Link>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">The account no longer exists.</p>
            )}
          </Panel>

          <Panel title="Decide">
            {closed ? (
              <div className="text-sm">
                <p><StatusBadge value={report.status} /> {report.resolved_at && <span className="text-muted-foreground">{fmtDateTime(report.resolved_at)}</span>}</p>
                {report.resolution && <p className="text-muted-foreground mt-2 break-words whitespace-pre-wrap">{report.resolution}</p>}
              </div>
            ) : canResolve ? (
              <ReportActions
                part="decide"
                reportId={report.id}
                assignedToMe={false}
                assignee={d.assignee_name}
                status={report.status}
                targetType={report.target_type}
                protectedOwner={Boolean(owner?.protected)}
                hasOwner={Boolean(owner?.id)}
                contentRemoved={contentRemoved}
                can={{ warn: canWarn, remove: canRemove, restrict: canRestrict, suspend: canSuspend }}
              />
            ) : (
              <p className="text-muted-foreground text-sm">You can view this report but not act on it.</p>
            )}
          </Panel>
        </aside>
      </div>
    </>
  );
}
