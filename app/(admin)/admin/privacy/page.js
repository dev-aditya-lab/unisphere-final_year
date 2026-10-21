import Link from "next/link";
import { CheckCircle2, CircleAlert } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Panel, StatCard, StatusBadge, fmtDateTime } from "@/components/admin/ui";
import { getMyPermissions } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { requestCountsForStaff } from "@/lib/privacy/requests";
import { readinessItems } from "@/lib/privacy/config";
import { hoursToBoardDeadline } from "@/lib/privacy/incident-templates";
import { CURRENT_NOTICE } from "@/lib/privacy/registry";
import { getIntegrations } from "@/lib/env";
import { redirect } from "next/navigation";

export const metadata = { title: "Privacy overview" };

export default async function PrivacyOverviewPage() {
  const names = new Set((await getMyPermissions()).map((p) => p.permission));
  if (!["privacy.requests", "privacy.manage", "privacy.incidents"].some((p) => names.has(p))) redirect("/forbidden");
  const supabase = await createClient();

  const [counts, incidents, officers] = await Promise.all([
    names.has("privacy.requests") ? requestCountsForStaff() : null,
    names.has("privacy.incidents")
      ? supabase.from("privacy_incidents").select("id, reference, title, status, severity, aware_at, board_initial_at, board_detailed_at").not("status", "in", "(closed,not_a_breach,resolved)").order("created_at", { ascending: false }).limit(10).then((r) => r.data ?? [])
      : null,
    names.has("privacy.manage") ? supabase.rpc("privacy_access_snapshot").then((r) => (r.data ?? []).filter((x) => x.role === "privacy_officer")) : null,
  ]);
  const i = getIntegrations();
  const operational = [
    { label: "At least two privacy officers (so no one approves their own breach notice or works on their own request)", done: officers ? new Set(officers.map((o) => o.user_id)).size >= 2 : null },
    { label: "Email delivery is configured (grievance receipts, erasure notices and breach notices are sent by email)", done: i.email },
    { label: "File storage is configured, so erasure can remove stored files", done: i.r2 },
    { label: "The background worker is calling /api/cron/tick (erasure, retention and AI jobs run there)", done: null, note: "Check that CRON_SECRET is set and a scheduler or `npm run worker` is running." },
  ];

  return (
    <>
      <PageHeader eyebrow="Privacy" title="Privacy overview" description={`Notice version ${CURRENT_NOTICE.version}. Requests, breach handling and the checks that keep them honest.`} />

      {counts && (
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Open requests" value={counts.open} href="/admin/privacy/requests" />
          <StatCard label="Overdue" value={counts.overdue} href="/admin/privacy/requests?status=overdue" tone="warn" />
          <StatCard label="Due in 3 days" value={counts.due_soon} href="/admin/privacy/requests" tone="warn" />
          <StatCard label="Open grievances" value={counts.grievances_open} href="/admin/privacy/requests?kind=grievance" />
        </div>
      )}

      {incidents && (
        <Panel title="Open data breaches" description="Breach reports to the Data Protection Board are due within 72 hours of confirming a breach." className="mb-6">
          {incidents.length === 0 ? (
            <p className="text-muted-foreground text-sm">None open.</p>
          ) : (
            <ul className="divide-y">
              {incidents.map((x) => {
                const h = hoursToBoardDeadline(x.aware_at);
                return (
                  <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <Link href={`/admin/privacy/incidents/${x.id}`} className="min-w-0 text-sm font-semibold hover:underline">{x.reference}: {x.title}</Link>
                    <span className="flex items-center gap-2">
                      <StatusBadge value={x.severity} /> <StatusBadge value={x.status} />
                      {h != null && !x.board_detailed_at && <span className={h < 0 ? "text-destructive-text text-xs font-semibold" : "text-warning-text text-xs font-semibold"}>{h < 0 ? `${Math.abs(Math.round(h))}h past the 72h report` : `${Math.round(h)}h to the 72h report`}</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      )}

      <Panel title="Readiness" description="What must be true before launch. Unknown means this page cannot tell from here; check it yourself.">
        <ul className="space-y-2.5">
          {[...readinessItems().map((r) => ({ label: r.label, done: r.done, note: r.detail })), ...operational].map((r) => (
            <li key={r.label} className="flex items-start gap-2.5 text-sm">
              {r.done === true ? <CheckCircle2 className="text-success-text mt-0.5 size-4 shrink-0" aria-label="Done" /> : <CircleAlert className={`mt-0.5 size-4 shrink-0 ${r.done === false ? "text-warning-text" : "text-muted-foreground"}`} aria-label={r.done === false ? "Needs attention" : "Unknown"} />}
              <span>
                {r.label}
                {r.note && <span className="text-muted-foreground block text-xs">{r.note}</span>}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-muted-foreground mt-4 text-xs">Last looked at {fmtDateTime(new Date().toISOString())}. The full launch checklist is in docs/DPDP_COMPLIANCE.md.</p>
      </Panel>
    </>
  );
}
