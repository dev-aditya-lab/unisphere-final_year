import { PageHeader } from "@/components/shell/page-header";
import { Panel, fmtDateTime } from "@/components/admin/ui";
import { SettingRow, FlagRow } from "@/components/admin/settings-forms";
import { hasPermission } from "@/lib/auth/session";
import { FLAG_META, SETTING_GROUPS, SETTING_META } from "@/lib/admin/settings-meta";
import { listSettingsAndFlags } from "@/lib/services/admin";
import { getPushOverview } from "@/lib/services/push";

export const metadata = { title: "Settings & flags" };

export default async function SettingsPage() {
  const [{ settings, flags }, canEdit, canFlag, push] = await Promise.all([listSettingsAndFlags(), hasPermission("settings.manage"), hasPermission("flags.manage"), getPushOverview().catch(() => null)]);
  const byKey = Object.fromEntries(settings.map((s) => [s.key, s]));
  const flagGroups = [...new Set(Object.values(FLAG_META).map((f) => f.group))];

  return (
    <>
      <PageHeader
        eyebrow="Insights & system" title="Settings & feature flags"
        description="Changes take effect within about 30 seconds, apply to the whole platform, and are written to the audit log. Secrets (API keys, SMTP, storage) are never edited here — they live in the server environment."
      />
      {!canEdit && <p className="bg-muted mb-5 rounded-md px-3 py-2 text-sm">You can view settings but not change them.</p>}

      <h2 className="font-heading mb-3 text-lg font-bold">Platform settings</h2>
      <div className="space-y-5">
        {SETTING_GROUPS.map((g) => (
          <Panel key={g.id} title={g.label}>
            <div className="divide-y">
              {g.keys.filter((k) => byKey[k] && SETTING_META[k]).map((k) => (
                <SettingRow key={k} name={k} meta={{ label: SETTING_META[k].label, kind: SETTING_META[k].kind, hint: SETTING_META[k].hint, danger: SETTING_META[k].danger }} value={byKey[k].value} updatedAt={byKey[k].updated_at ? fmtDateTime(byKey[k].updated_at) : null} disabled={!canEdit} />
              ))}
            </div>
          </Panel>
        ))}
      </div>

      {push && (
        <>
          <h2 className="font-heading mt-10 mb-3 text-lg font-bold">Push notifications</h2>
          <Panel title="Where notifications can be delivered" description="Set up in the server environment, never here. A device is one browser or one phone a member turned notifications on for.">
            <div className="divide-y text-sm">
              {[
                { label: "Browsers and installed web app (Web Push)", ready: push.web.configured, devices: push.web.devices, missing: "VAPID keys are missing (NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)." },
                { label: "Android app (Firebase Cloud Messaging)", ready: push.android.configured, devices: push.android.devices, missing: "FIREBASE_SERVICE_ACCOUNT is missing or not a service account key. See docs/ANDROID_APP.md." },
              ].map((row) => (
                <div key={row.label} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <div>
                    <p className="font-semibold">{row.label}</p>
                    <p className="text-muted-foreground text-[13px]">{row.ready ? "Ready to send." : row.missing}</p>
                  </div>
                  <p className="text-muted-foreground tabular-nums">{row.devices.toLocaleString("en-IN")} {row.devices === 1 ? "device" : "devices"}</p>
                </div>
              ))}
            </div>
          </Panel>
        </>
      )}

      <h2 className="font-heading mt-10 mb-3 text-lg font-bold">Feature flags</h2>
      <p className="text-muted-foreground mb-3 -mt-1 text-sm">Switching a flag off hides the feature everywhere and makes its server endpoints refuse requests. Existing data is kept.</p>
      <div className="space-y-5">
        {flagGroups.map((group) => (
          <Panel key={group} title={group}>
            <div className="divide-y">
              {flags.filter((f) => FLAG_META[f.key]?.group === group).map((f) => (
                <FlagRow key={f.key} name={f.key} label={FLAG_META[f.key].label} description={f.description} enabled={f.enabled} disabled={!canFlag} />
              ))}
            </div>
          </Panel>
        ))}
      </div>
    </>
  );
}
