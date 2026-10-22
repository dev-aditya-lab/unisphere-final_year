import Link from "next/link";
import { PrivacyForm } from "@/components/settings/privacy-form";
import { OrbitsPrivacyForm } from "@/components/settings/orbits-privacy-form";
import { ConsentManager } from "@/components/privacy/consent-manager";
import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { readConsentHistory } from "@/lib/privacy/consent";
import { gateFor } from "@/lib/privacy/gate-server";
import { NOTICE_VERSION, OPTIONAL_PURPOSES, PURPOSE_BY_KEY } from "@/lib/privacy/registry";
import { SettingsSection } from "@/components/settings/section";
import { fmtDate } from "@/components/privacy/request-status";

export const metadata = { title: "Privacy settings" };

const STATUS_LABEL = { granted: "Turned on", withdrawn: "Turned off", declined: "Declined" };
const SOURCE_LABEL = { signup: "when signing up", settings: "in Settings", review: "in the privacy review", feature_prompt: "from an AI prompt", application: "in an application", system: "by the system" };

export default async function PrivacySettingsPage() {
  const { profile } = await requireProfile({ allowIncomplete: true });
  const supabase = await createClient();
  const [history, gate] = await Promise.all([readConsentHistory(supabase, 20), gateFor(profile)]);
  const essentials = ["core_service", "age_confirmation"].map((k) => ({ p: PURPOSE_BY_KEY[k], c: profile.consents?.[k] }));

  return (
    <div className="space-y-4">
      {(gate.state === "review_soft" || gate.state === "review_required" || gate.state === "minor") && (
        <section className="surface border-warning/50 p-5 sm:p-6" aria-labelledby="review">
          <h2 id="review" className="text-lg font-bold">Please review your privacy choices</h2>
          <p className="text-muted-foreground mt-1 text-sm">Your account has no recorded consent yet. It takes a minute, and nothing optional is switched on for you.</p>
          <Link href="/privacy-review?next=/settings/privacy" className="text-blue-text mt-3 inline-block text-sm font-semibold underline">Review now</Link>
        </section>
      )}

      <PrivacyForm profile={profile} />

      <SettingsSection id="consents" title="Optional uses of your information" description="All off until you turn them on. Each switch saves straight away." defaultOpen>
        <ConsentManager purposes={OPTIONAL_PURPOSES} consents={profile.consents ?? {}} />
      </SettingsSection>

      <OrbitsPrivacyForm profile={profile} />

      <SettingsSection id="essential" title="What your account rests on" description="Agreed when you joined; these cannot be switched off.">
        <ul className="space-y-2 text-sm">
          {essentials.map(({ p, c }) => (
            <li key={p.key} className="flex flex-wrap items-baseline justify-between gap-2">
              <span>{p.label}</span>
              <span className="text-muted-foreground text-xs">{c?.status === "granted" ? `Agreed ${fmtDate(c.updated_at)} (notice ${c.notice_version})` : "Not recorded yet"}</span>
            </li>
          ))}
        </ul>
        <p className="text-muted-foreground text-xs">
          They cannot be switched off without leaving UniSphere. To withdraw them, <Link href="/delete-account" className="text-blue-text underline">delete your account</Link>. Current notice: {NOTICE_VERSION}.
        </p>
      </SettingsSection>

      <SettingsSection id="history" title="Your consent history" description="Every choice you have made, newest first.">
        {history.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nothing has been recorded yet.</p>
        ) : (
          <ol className="space-y-2 text-sm">
            {history.map((h) => (
              <li key={h.id} className="flex flex-col gap-0.5 sm:flex-row sm:flex-wrap sm:items-baseline sm:justify-between sm:gap-x-3">
                <span>
                  <strong className="font-semibold">{STATUS_LABEL[h.status] ?? h.status}:</strong> {PURPOSE_BY_KEY[h.purpose]?.label ?? h.purpose}
                </span>
                <span className="text-muted-foreground text-xs">
                  {fmtDate(h.created_at)}, {SOURCE_LABEL[h.source] ?? h.source}, notice {h.notice_version}
                </span>
              </li>
            ))}
          </ol>
        )}
        <p className="text-muted-foreground text-xs">
          More about your data: <Link href="/privacy-requests" className="text-blue-text underline">download a copy, correct it, or delete it</Link>.
        </p>
      </SettingsSection>
    </div>
  );
}
