import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Panel, StatCard, fmtDateTime, fmtNumber } from "@/components/admin/ui";
import { RunRetentionButton } from "@/components/admin/privacy-admin";
import { getMyPermissions, requireProfile } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSetting } from "@/lib/settings";
import { getIntegrations } from "@/lib/env";
import { redirect } from "next/navigation";

export const metadata = { title: "Retention & erasure" };

export default async function RetentionPage() {
  await requireProfile();
  const names = new Set((await getMyPermissions()).map((p) => p.permission));
  if (!names.has("privacy.manage") && !names.has("privacy.requests")) redirect("/forbidden");
  const db = createAdminClient();
  const [retention, lastRun, pending, processing, stuck, ledgerOpen, ledgerDone, orphanLike] = await Promise.all([
    getSetting("privacy_retention"),
    getSetting("privacy_retention_last_run"),
    db.from("account_deletion_requests").select("id", { count: "exact", head: true }).eq("status", "pending").then((r) => r.count ?? 0),
    db.from("account_deletion_requests").select("id", { count: "exact", head: true }).eq("status", "processing").then((r) => r.count ?? 0),
    db.from("account_deletion_requests").select("id, attempts, last_error, last_attempt_at, scheduled_for").eq("status", "processing").gte("attempts", 3).order("attempts", { ascending: false }).limit(20).then((r) => r.data ?? []),
    db.from("erasure_ledger").select("user_ref", { count: "exact", head: true }).eq("status", "started").then((r) => r.count ?? 0),
    db.from("erasure_ledger").select("user_ref", { count: "exact", head: true }).eq("status", "completed").then((r) => r.count ?? 0),
    db.from("privacy_requests").select("id", { count: "exact", head: true }).eq("kind", "erasure").eq("status", "in_progress").is("user_id", null).then((r) => r.count ?? 0),
  ]);
  const r2 = getIntegrations().r2;

  return (
    <>
      <PageHeader eyebrow="Privacy" title="Retention & erasure" description="How long records are kept, and whether account erasures are really finishing." actions={names.has("privacy.manage") ? <RunRetentionButton /> : null} />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Waiting out the 14 days" value={fmtNumber(pending)} />
        <StatCard label="Being erased" value={fmtNumber(processing)} tone="warn" />
        <StatCard label="Stuck (3+ attempts)" value={fmtNumber(stuck.length)} tone="warn" />
        <StatCard label="Erasures completed" value={fmtNumber(ledgerDone)} hint={`${fmtNumber(ledgerOpen)} open in the ledger`} />
      </div>
      {!r2 && <p role="alert" className="text-warning-text mb-4 text-sm font-semibold">File storage is not configured on this server, so erasure cannot remove stored files. Configure it before relying on erasure.</p>}
      {orphanLike > 0 && <p className="text-warning-text mb-4 text-sm">{orphanLike} erasure request(s) are waiting for their paperwork to be reconciled; the retention job closes them.</p>}

      {stuck.length > 0 && (
        <Panel title="Erasures that keep failing" description="They are retried with a growing delay for up to 20 attempts. The error names the step; fix the cause (storage, auth) and they finish by themselves." className="mb-6">
          <ul className="divide-y text-sm">
            {stuck.map((s) => (
              <li key={s.id} className="py-2.5"><span className="font-mono text-xs">{s.id.slice(0, 8)}</span> · {s.attempts} attempts · last {fmtDateTime(s.last_attempt_at)}<span className="text-destructive-text block text-xs">{s.last_error ?? "no error recorded"}</span></li>
            ))}
          </ul>
          <p className="mt-3 text-xs"><Link href="/admin/deletions?status=processing" className="text-blue-text underline">Open the deletion queue</Link> (needs the member-deletion permission).</p>
        </Panel>
      )}

      <Panel title="Retention windows (days)" description="Applied by the retention job, which runs on its own every six hours. These are placeholders pending legal review; change them in Privacy settings." className="mb-6">
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {Object.entries(retention ?? {}).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3"><dt className="text-muted-foreground">{k.replace(/_/g, " ")}</dt><dd className="font-semibold tabular-nums">{v}</dd></div>
          ))}
        </dl>
        <p className="text-muted-foreground mt-3 text-xs">Last run: {typeof lastRun === "string" && lastRun.startsWith("1970") ? "never" : fmtDateTime(lastRun)}.</p>
      </Panel>

      <Panel title="Backups and restores">
        <p className="text-muted-foreground text-sm leading-relaxed">
          Backups are kept by the database provider and expire on its schedule; UniSphere cannot erase inside them. If a backup is ever restored, run <code className="font-mono text-xs">npm run privacy:replay-erasures</code> with a ledger exported before the restore, before reopening the service, so erased accounts are erased again. See docs/DPDP_RETENTION.md.
        </p>
      </Panel>
    </>
  );
}
