import { PageHeader } from "@/components/shell/page-header";
import { DataTable, EmptyRow, Pager, Panel, fmtDateTime } from "@/components/admin/ui";
import { SettingRow } from "@/components/academy/admin/setting-row";
import { PAGE_SIZE } from "@/lib/admin/paging";
import { can, needAcademy, offset, rows } from "@/lib/services/academy-admin";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Academy settings" };

const v = (all, key, fallback = "") => {
  const x = all.get(key);
  return x === undefined || x === null ? fallback : typeof x === "string" ? x : x;
};

export default async function AcademySettings({ searchParams }) {
  await needAcademy("academy.settings.manage", "academy.audit.view", "academy.pricing.manage");
  const sp = await searchParams;
  const [settingsOk, pricing, auditOk] = await Promise.all([can("academy.settings.manage"), can("academy.pricing.manage"), can("academy.audit.view")]);
  const { data } = await (await createClient()).from("academy_settings").select("key, value");
  const all = new Map((data ?? []).map((r) => [r.key, r.value]));
  const page = Math.max(1, Number(sp.page) || 1);
  const q = typeof sp.q === "string" ? sp.q.slice(0, 80) : "";
  const audit = auditOk ? await rows("academy_list_audit", { p_search: q || null, p_limit: PAGE_SIZE, p_offset: offset(page) }) : [];
  const total = Number(audit[0]?.total_count ?? 0);
  const money = pricing && settingsOk;
  const bps = Number(v(all, "tax_rate_bps", 0));

  return (
    <>
      <PageHeader eyebrow="Academy" title="Settings and audit log" description="Change anything here without touching code. Every change is recorded with who made it and the old and new value." />
      {settingsOk && (
        <>
          <Panel title="Selling" description="Money, tax and coupon rules need pricing access as well. Tax rates are not invented: set them with your accountant or tax adviser." className="mb-6">
            <div className="divide-y">
              <SettingRow settingKey="sales_enabled" type="checkbox" label="Paid enrolment is open" hint="Free courses always work. Turn this on only after a payment gateway is connected and tested." initial={v(all, "sales_enabled", false) === true} disabled={!money} />
              <SettingRow settingKey="tax_mode" type="select" label="Tax" hint="None, already inside the listed price, or added at checkout." initial={v(all, "tax_mode", "none")} options={[{ value: "none", label: "No tax is charged" }, { value: "inclusive", label: "Included in the price" }, { value: "exclusive", label: "Added on top" }]} disabled={!money} />
              <SettingRow settingKey="tax_rate_bps" label="Tax rate (%)" hint="For example 18. Ignored when no tax is charged." initial={bps === 0 ? "0" : String(bps / 100)} disabled={!money} />
              <SettingRow settingKey="tax_label" label="Tax name" hint="Shown to students, for example GST." initial={v(all, "tax_label", "GST")} disabled={!money} />
              <SettingRow settingKey="coupon_with_sale" type="select" label="Coupons on sale prices" hint="Whether a coupon can be used on top of a scheduled price. A coupon can also forbid it for itself." initial={v(all, "coupon_with_sale", "allow")} options={[{ value: "allow", label: "Allowed" }, { value: "block", label: "Not allowed" }]} disabled={!money} />
              <SettingRow settingKey="refund_window_days" label="Refund window (days)" hint="After payment. A course can set its own." initial={String(v(all, "refund_window_days", 7))} />
              <SettingRow settingKey="order_hold_minutes" label="Hold an unpaid order (minutes)" hint="It keeps its seat and coupon this long." initial={String(v(all, "order_hold_minutes", 60))} />
            </div>
            <p className="text-muted-foreground mt-3 text-xs">Currency is INR: the payment layer supports nothing else yet.</p>
          </Panel>
          <Panel title="Organisation and certificates" className="mb-6">
            <div className="divide-y">
              <SettingRow settingKey="issuing_organization" label="Issuing organisation" hint="Printed on certificates and shown when one is verified." initial={v(all, "issuing_organization", "UniSphere Academy")} />
              <SettingRow settingKey="support_email" label="Support email" hint="Shown to students and to people verifying a certificate, for questions and disputes." initial={v(all, "support_email", "")} />
              <SettingRow settingKey="code_prefix" label="Course code prefix" hint="First part of new course codes (USA-WD-001). Existing codes never change." initial={v(all, "code_prefix", "USA")} />
              <SettingRow settingKey="certificate_prefix" label="Certificate ID prefix" hint="First part of new certificate IDs (US-2026-WD-00142). Existing IDs never change." initial={v(all, "certificate_prefix", "US")} />
            </div>
          </Panel>
          <Panel title="Reminders and recordings" className="mb-8">
            <div className="divide-y">
              <SettingRow settingKey="assignment_reminder_hours" label="Deadline reminder (hours before)" hint="Students who have not handed in are reminded this long before the deadline." initial={String(v(all, "assignment_reminder_hours", 24))} />
              <SettingRow settingKey="recording_retention_days" label="Keep class recordings (days)" hint="After a recording is made available, it stops being available after this many days." initial={String(v(all, "recording_retention_days", 180))} />
            </div>
            <p className="text-muted-foreground mt-3 text-xs">Live class reminders go out 24 hours and 1 hour before a class (change in the database setting live_reminder_hours).</p>
          </Panel>
        </>
      )}

      {auditOk && (
        <>
          <h2 className="font-heading mb-3 text-lg font-bold">Audit log</h2>
          <form method="get" role="search" className="mb-4 flex gap-2"><input name="q" defaultValue={q} placeholder="Action, record or person" aria-label="Search the audit log" className="border-input bg-card h-9 w-72 rounded-md border px-3 text-sm" /><button type="submit" className="h-9 rounded-md border px-4 text-sm font-semibold">Search</button></form>
          <DataTable caption="Academy audit log" columns={["When", "Who", "What", "Record", "Details"]} empty={audit.length === 0 && <EmptyRow>Nothing logged yet.</EmptyRow>}>
            {audit.map((a) => (
              <tr key={a.id} className="align-top">
                <td className="px-4 py-3 text-xs whitespace-nowrap">{fmtDateTime(a.created_at)}</td>
                <td className="px-4 py-3">{a.actor_name ?? <span className="text-muted-foreground">system</span>}</td>
                <td className="px-4 py-3 font-mono text-xs">{a.action.replace(/^academy\./, "")}</td>
                <td className="px-4 py-3 font-mono text-[11px] break-all">{a.metadata?.ref ?? a.target_id}</td>
                <td className="max-w-80 px-4 py-3 font-mono text-[11px] break-words">{Object.entries(a.metadata ?? {}).filter(([k]) => k !== "ref").map(([k, val]) => `${k}: ${typeof val === "object" ? (val?.from !== undefined ? `${JSON.stringify(val.from)} → ${JSON.stringify(val.to)}` : JSON.stringify(val)) : val}`).join(" · ")}</td>
              </tr>
            ))}
          </DataTable>
          <Pager basePath="/admin/academy/settings" page={page} total={total} params={{ q }} />
        </>
      )}
    </>
  );
}
