"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, CheckCircle2, Eye, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { ModerateMemberDialog, RemoveMessageDialog } from "@/components/community/dialogs";
import { ChatMarkdown } from "@/components/posts/chat-markdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { UserAvatar } from "@/components/user-avatar";
import { escalateReportAction, removeMessageAction, reviewAppealAction, suggestReportTriageAction, updateReportAction } from "@/lib/actions/community-workspace";
import { Sparkles } from "@/components/icons/lucide-compat";
import { MOD_ACTION_LABEL, REPORT_STATUS_LABEL, reportCategoryLabel } from "@/lib/community/rules";
import { cn } from "@/lib/utils";

const fmt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" });
const SEVERITY = { low: "mono", medium: "soft", high: "default", critical: "default" };

function Person({ p, fallback = "Unknown" }) {
  if (!p) return <span className="text-muted-foreground">{fallback}</span>;
  return <span className="inline-flex items-center gap-1.5"><UserAvatar name={p.full_name} avatarKey={p.avatar_key} size="xs" /><strong>{p.full_name}</strong></span>;
}

function ReportCard({ report, community, myRole, onChange, aiAvailable }) {
  const [pending, startTransition] = useTransition();
  const [dialog, setDialog] = useState(null);
  const [aiNote, setAiNote] = useState(null);
  const closed = ["dismissed", "action_taken"].includes(report.status);
  const snap = report.snapshot ?? {};
  const evidencePurged = !snap.body && !snap.full_name && !snap.username && report.status !== "open" && Object.keys(snap).length === 0;
  const run = (fn, ok) => startTransition(async () => { const r = await fn(); if (r.ok) { if (ok) toast.success(ok); onChange(); } else toast.error(r.error); });

  return (
    <li className="space-y-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant={SEVERITY[report.severity] ?? "mono"}>{report.severity}</Badge>
        <strong>{reportCategoryLabel(report.category)}</strong>
        <span className="text-muted-foreground text-xs">{report.target_type === "member" ? "about a member" : `message in #${snap.channel ?? "channel"}`} · {fmt.format(new Date(report.created_at))}</span>
        <Badge variant="mono" className="ml-auto">{REPORT_STATUS_LABEL[report.status]}</Badge>
        {report.escalated_at && <Badge variant="soft">With the UniSphere team</Badge>}
      </div>
      <p className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
        <span>Reported by <Person p={report.reporter} fallback="a former member" /></span>
        <span>About <Person p={report.target} fallback="a former member" /></span>
      </p>
      {report.details && <p className="bg-muted rounded-lg p-3 text-sm"><span className="text-muted-foreground block text-xs font-semibold">What the reporter said</span>{report.details}</p>}

      {report.target_type === "channel_message" && (
        <div className="rounded-lg border border-dashed p-3">
          <p className="text-muted-foreground mb-1 text-xs font-semibold">The reported message (a copy kept for review)</p>
          {evidencePurged ? <p className="text-muted-foreground text-sm italic">The copy was erased after the retention period. The outcome is kept.</p> : snap.body ? <ChatMarkdown text={snap.body} /> : <p className="text-muted-foreground text-sm italic">No text (attachments only).</p>}
          {snap.attachments?.length > 0 && <p className="text-muted-foreground mt-1 text-xs">Attached: {snap.attachments.map((a) => a.name || a.type).join(", ")}</p>}
          {snap.context?.length > 0 && (
            <details className="mt-2 text-xs">
              <summary className="cursor-pointer font-semibold">Earlier messages for context</summary>
              <ul className="mt-1 space-y-1">{snap.context.map((c, i) => <li key={i} className="text-muted-foreground">“{c.body}”</li>)}</ul>
            </details>
          )}
        </div>
      )}
      {report.target_type === "member" && snap.full_name && <p className="text-sm">{snap.full_name} (@{snap.username}) · {snap.role}</p>}
      {aiNote && <p className="bg-primary-soft rounded-lg p-3 text-sm" role="note"><strong>Suggestion (advisory only):</strong> {aiNote}</p>}
      {report.resolution && <p className="text-sm"><span className="text-muted-foreground">Outcome: </span>{report.resolution}</p>}

      {!closed && (
        <div className="flex flex-wrap gap-2">
          {report.status === "open" && <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => updateReportAction({ reportId: report.id, status: "reviewing" }))}><Eye /> Start review</Button>}
          {report.target_type === "channel_message" && <Button size="sm" variant="destructive" disabled={pending} onClick={() => setDialog({ type: "remove" })}>Remove message</Button>}
          {report.target_user_id && <Button size="sm" variant="outline" disabled={pending} onClick={() => setDialog({ type: "moderate", action: "warn" })}>Warn</Button>}
          {report.target_user_id && <Button size="sm" variant="outline" disabled={pending} onClick={() => setDialog({ type: "moderate", action: "timeout" })}>Time out</Button>}
          {report.target_user_id && ["admin", "owner"].includes(myRole) && <Button size="sm" variant="outline" disabled={pending} onClick={() => setDialog({ type: "moderate", action: "ban" })}>Ban</Button>}
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => updateReportAction({ reportId: report.id, status: "dismissed", resolution: "No violation found" }), "Report dismissed")}><CheckCircle2 /> Dismiss</Button>
          {aiAvailable && report.target_type === "channel_message" && snap.body && (
            <Button
              size="sm" variant="ghost" disabled={pending}
              onClick={() => startTransition(async () => {
                const r = await suggestReportTriageAction(report.id);
                if (r.ok) setAiNote(`${reportCategoryLabel(r.suggestion.category)}, ${r.suggestion.severity} severity (confidence ${r.suggestion.confidence}). ${r.suggestion.rationale} AI cannot judge intent or context: read the thread and decide yourself.`);
                else toast.error(r.error);
              })}
            >
              <Sparkles /> Second opinion
            </Button>
          )}
          {!report.escalated_at && <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => escalateReportAction(report.id), "Passed to the UniSphere team")}><ArrowUpRight /> Escalate</Button>}
        </div>
      )}

      {dialog?.type === "remove" && (
        <RemoveMessageDialog open onOpenChange={(o) => !o && setDialog(null)} onConfirm={async (reason) => { const r = await removeMessageAction({ messageId: report.target_id, reason, reportId: report.id }); if (r.ok) { toast.success("Message removed"); onChange(); } return r; }} />
      )}
      {dialog?.type === "moderate" && (
        <ModerateMemberDialog open onOpenChange={(o) => !o && setDialog(null)} communityId={community.id} person={{ user_id: report.target_user_id, full_name: report.target?.full_name }} action={dialog.action} reportId={report.id} onDone={onChange} />
      )}
    </li>
  );
}

function AppealCard({ appeal, onChange }) {
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const decide = (decision) => startTransition(async () => {
    const r = await reviewAppealAction({ appealId: appeal.id, decision, note });
    if (r.ok) { toast.success(decision === "upheld" ? "Appeal upheld" : "Appeal denied"); onChange(); } else toast.error(r.error);
  });
  return (
    <li className="space-y-2 rounded-xl border p-4 text-sm">
      <p className="flex flex-wrap items-center gap-2"><Person p={appeal.user} /> appealed <strong>{MOD_ACTION_LABEL[appeal.action?.action] ?? "a decision"}</strong><span className="text-muted-foreground text-xs">{fmt.format(new Date(appeal.created_at))}</span><Badge variant="mono" className="ml-auto capitalize">{appeal.status}</Badge></p>
      {appeal.action?.reason && <p className="text-muted-foreground text-xs">The reason given was: “{appeal.action.reason}”</p>}
      <p className="bg-muted rounded-lg p-3">{appeal.message}</p>
      {appeal.status === "pending" ? (
        <>
          <Textarea rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="A note for the member (optional)" aria-label="Note to the member" />
          <div className="flex gap-2"><Button size="sm" disabled={pending} onClick={() => decide("upheld")}>Uphold appeal</Button><Button size="sm" variant="outline" disabled={pending} onClick={() => decide("denied")}>Deny</Button></div>
        </>
      ) : appeal.review_note ? <p>Reviewer&rsquo;s note: {appeal.review_note}</p> : null}
    </li>
  );
}

/** The moderation queue: reports, then appeals, then what staff have done. Everything here is limited by rank on the server. */
export function ModerationPanel({ community, myRole, reports, appeals, actions, closedReports, aiAvailable = false }) {
  const router = useRouter();
  const refresh = () => router.refresh();
  return (
    <div className="space-y-8">
      <section aria-labelledby="mod-reports">
        <h3 id="mod-reports" className="mb-2 flex items-center gap-2 text-sm font-bold"><ShieldAlert className="size-4" aria-hidden="true" /> Open reports <Badge variant="mono">{reports.length}</Badge></h3>
        <p className="text-muted-foreground mb-3 text-xs">You see reports about people who rank below you. Reports about the owner go straight to the UniSphere team. Reporters&rsquo; names are never shown to the people they reported.</p>
        {reports.length === 0 ? <p className="text-muted-foreground text-sm">Nothing to review. Thank you for keeping the community safe.</p> : <ul className="space-y-3">{reports.map((r) => <ReportCard key={r.id} report={r} community={community} myRole={myRole} onChange={refresh} aiAvailable={aiAvailable} />)}</ul>}
      </section>

      <section aria-labelledby="mod-appeals">
        <h3 id="mod-appeals" className="mb-2 text-sm font-bold">Appeals <Badge variant="mono">{appeals.filter((a) => a.status === "pending").length} waiting</Badge></h3>
        <p className="text-muted-foreground mb-3 text-xs">You cannot review an appeal about a decision you made yourself. Administrators and the owner review appeals.</p>
        {appeals.length === 0 ? <p className="text-muted-foreground text-sm">No appeals.</p> : <ul className="space-y-3">{appeals.map((a) => <AppealCard key={a.id} appeal={a} onChange={refresh} />)}</ul>}
      </section>

      <section aria-labelledby="mod-log">
        <h3 id="mod-log" className="mb-2 text-sm font-bold">Recent moderation actions</h3>
        {actions.length === 0 ? <p className="text-muted-foreground text-sm">Nothing yet.</p> : (
          <ul className="divide-y text-sm">
            {actions.map((a) => (
              <li key={a.id} className={cn("flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2", a.action === "note" && "bg-muted/40 px-2")}>
                <strong>{MOD_ACTION_LABEL[a.action] ?? a.action}</strong>
                <span>{a.target?.full_name ?? "a former member"}</span>
                <span className="text-muted-foreground text-xs">by {a.actor?.full_name ?? "staff"} · {fmt.format(new Date(a.created_at))}</span>
                {a.reason && <span className="text-muted-foreground w-full text-xs">{a.reason}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {closedReports.length > 0 && (
        <section aria-labelledby="mod-closed">
          <h3 id="mod-closed" className="mb-2 text-sm font-bold">Recently closed reports</h3>
          <ul className="divide-y text-sm">
            {closedReports.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-3 py-2">
                <Badge variant="mono">{REPORT_STATUS_LABEL[r.status]}</Badge>
                <span>{reportCategoryLabel(r.category)}</span>
                <span className="text-muted-foreground text-xs">{r.resolved_at ? fmt.format(new Date(r.resolved_at)) : ""}</span>
                {r.resolution && <span className="text-muted-foreground text-xs">— {r.resolution}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
