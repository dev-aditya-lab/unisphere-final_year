import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { DataTable, Panel, StatCard, fmtDateTime, fmtNumber } from "@/components/admin/ui";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CURRENT_NOTICE, PURPOSES } from "@/lib/privacy/registry";
import { noticeFingerprint } from "@/lib/privacy/fingerprint";

export const metadata = { title: "Notices & consent" };

export default async function NoticesPage() {
  await requirePermission("privacy.manage");
  const supabase = await createClient();
  const db = createAdminClient();
  const [{ data: versions }, total, ...granted] = await Promise.all([
    supabase.from("privacy_notice_versions").select("version, effective_at, summary, reconsent_purposes, content_hash, created_at").order("effective_at", { ascending: false }),
    db.from("profiles").select("id", { count: "exact", head: true }).in("status", ["active", "restricted"]).then((r) => r.count ?? 0),
    ...PURPOSES.map((p) => db.from("consent_current").select("user_id", { count: "exact", head: true }).eq("purpose", p.key).eq("status", "granted").then((r) => ({ key: p.key, label: p.label, count: r.count ?? 0 }))),
  ]);
  const core = granted.find((g) => g.key === "core_service")?.count ?? 0;
  const published = (versions ?? []).some((v) => v.version === CURRENT_NOTICE.version);
  const inSync = (versions ?? []).find((v) => v.version === CURRENT_NOTICE.version)?.content_hash === noticeFingerprint();

  return (
    <>
      <PageHeader eyebrow="Privacy" title="Notices & consent" description="Every notice version that was ever shown is kept, unchanged. Consent is recorded per purpose, with the version in force at the time." />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Current notice" value={CURRENT_NOTICE.version} hint={published ? "archived" : "archived on first use"} />
        <StatCard label="Active members" value={fmtNumber(total)} />
        <StatCard label="With recorded account consent" value={fmtNumber(core)} hint={`${fmtNumber(Math.max(0, total - core))} still to review`} tone="warn" />
        <StatCard label="Matches the code" value={published ? (inSync ? "Yes" : "NO") : "Not yet archived"} hint="The archived text must equal the running code" />
      </div>
      {published && !inSync && (
        <p role="alert" className="text-destructive-text mb-4 text-sm font-semibold">The archived version differs from the text the code serves. The notice was changed without a new version: add one in lib/privacy/registry.js.</p>
      )}

      <Panel title="Members who agreed or allowed, by purpose" className="mb-6">
        <ul className="divide-y text-sm">
          {granted.map((g) => (
            <li key={g.key} className="flex items-baseline justify-between gap-3 py-2"><span>{g.label}</span><strong className="tabular-nums">{fmtNumber(g.count)}</strong></li>
          ))}
        </ul>
      </Panel>

      <DataTable caption="Notice versions" columns={["Version", "In effect from", "Summary", "Asks again for"]}>
        {(versions ?? []).map((v) => (
          <tr key={v.version} className="align-top">
            <td className="px-4 py-3 font-mono text-xs whitespace-nowrap"><Link href={`/privacy-centre/versions/${v.version}`} className="text-blue-text hover:underline">{v.version}</Link></td>
            <td className="px-4 py-3 whitespace-nowrap">{fmtDateTime(v.effective_at)}</td>
            <td className="text-muted-foreground max-w-md px-4 py-3">{v.summary}</td>
            <td className="px-4 py-3 text-xs">{v.reconsent_purposes?.length ? v.reconsent_purposes.join(", ") : "nothing: people are informed only"}</td>
          </tr>
        ))}
      </DataTable>
      <p className="text-muted-foreground mt-3 text-xs">A new version is added in code (lib/privacy/registry.js) and archived automatically the first time it is used. It cannot be edited afterwards.</p>
    </>
  );
}
