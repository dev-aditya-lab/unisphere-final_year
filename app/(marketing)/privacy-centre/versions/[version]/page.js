import Link from "next/link";
import { notFound } from "next/navigation";
import { LegalPage } from "@/components/marketing/legal-page";
import { createAnonClient } from "@/lib/supabase/anon";

export const metadata = { title: "Earlier privacy policy", robots: { index: false, follow: true } };

const date = (iso) => new Intl.DateTimeFormat("en-IN", { dateStyle: "long", timeZone: "Asia/Kolkata" }).format(new Date(iso));

/** An archived version of the privacy policy, exactly as it was published (the archive is append-only). */
export default async function PolicyVersionPage({ params }) {
  const { version } = await params;
  if (!/^\d{4}-\d{2}-\d{2}\.\d{1,3}$/.test(version)) notFound();
  const { data } = await createAnonClient().from("privacy_notice_versions").select("version, effective_at, summary, document").eq("version", version).maybeSingle();
  if (!data?.document?.policy) notFound();
  return (
    <LegalPage
      eyebrow={`Archived · version ${data.version}`}
      title="Privacy policy"
      intro={`This is the policy as it stood from ${date(data.effective_at)}. ${data.summary ?? ""}`}
      sections={data.document.policy}
      markdown={null}
      updated={date(data.effective_at)}
    >
      <p className="mt-10 text-sm">
        <Link href="/privacy" className="text-blue-text underline">Read the current policy</Link>
      </p>
    </LegalPage>
  );
}
