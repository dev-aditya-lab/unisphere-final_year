import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, BadgeCheck, CircleHelp, Clock3, ExternalLink, ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VerifyForm } from "@/components/academy/verify-form";
import { PrintButton } from "@/components/academy/print-button";
import { KINDS } from "@/lib/academy/constants";
import { formatDateLong } from "@/lib/academy/cert-vars";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { getAcademySettings, verifyCertificate } from "@/lib/services/academy";

// The result changes the moment a certificate is revoked, so it is never cached, and a certificate page is never indexed.
export const dynamic = "force-dynamic";
export const metadata = { title: "Certificate verification", robots: { index: false, follow: false } };

const SHAPE = /^[A-Za-z0-9]{2,6}-\d{4}-[A-Za-z0-9]{1,8}-\d{4,8}$/;

const TONE = {
  valid: { Icon: BadgeCheck, title: "Valid certificate", ring: "border-[var(--success)]", chip: "ac-chip-mint", text: "This certificate was issued by the organisation below and has not been revoked." },
  revoked: { Icon: ShieldX, title: "This certificate has been revoked", ring: "border-[var(--destructive)]", chip: "", text: "It was issued, but it is no longer valid." },
  pending: { Icon: Clock3, title: "Not available yet", ring: "border-[var(--border-strong)]", chip: "", text: "A certificate with this ID is being prepared, so it cannot be verified yet. Try again later." },
  not_found: { Icon: CircleHelp, title: "No certificate found", ring: "border-[var(--border-strong)]", chip: "", text: "We have no certificate with this ID. Check the ID for typing mistakes." },
};

const Row = ({ label, children }) => children ? <div className="grid gap-1 py-3 sm:grid-cols-[11rem_1fr]"><dt className="text-muted-foreground text-sm">{label}</dt><dd className="font-medium break-words">{children}</dd></div> : null;

export default async function VerifyResult({ params }) {
  const raw = decodeURIComponent((await params).certificateId ?? "").slice(0, 60);
  if (!SHAPE.test(raw)) notFound();

  // Anyone may ask, so each address is limited: a person checking one certificate is never slowed, a script walking through IDs is.
  const limit = await rateLimit({ key: `acad-verify:${await getClientIp()}`, limit: 40, windowSec: 600 });
  if (!limit.ok) {
    return (
      <div className="mx-auto max-w-xl px-4 py-24 text-center" role="alert">
        <AlertTriangle className="mx-auto size-8 text-muted-foreground" aria-hidden />
        <h1 className="ac-display mt-4 text-3xl">Too many checks</h1>
        <p className="text-muted-foreground mt-2">Please wait a few minutes and try again.</p>
      </div>
    );
  }

  const [result, settings] = await Promise.all([verifyCertificate(raw), getAcademySettings()]);
  const status = TONE[result.status] ? result.status : result.status === "error" ? null : "not_found";
  const id = (result.certificate_id ?? raw).toUpperCase();

  if (!status) {
    return (
      <div className="mx-auto max-w-xl px-4 py-24 text-center" role="alert">
        <h1 className="ac-display text-3xl">We could not check that right now</h1>
        <p className="text-muted-foreground mt-2">The verification service did not answer. Please try again in a moment. This does not mean the certificate is invalid.</p>
        <Button asChild className="mt-6"><Link href={`/academy/verify/${encodeURIComponent(id)}`}>Try again</Link></Button>
      </div>
    );
  }
  const t = TONE[status];
  const showDetails = status === "valid" || status === "revoked";

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <p className="ac-kicker">Certificate verification</p>
      <section aria-live="polite" className={`ac-card mt-4 border-2 p-6 sm:p-8 ${t.ring}`}>
        <div className="flex items-start gap-4">
          <t.Icon className={`mt-1 size-9 shrink-0 ${status === "valid" ? "text-[var(--success-text)]" : status === "revoked" ? "text-destructive" : "text-muted-foreground"}`} aria-hidden />
          <div>
            <h1 className="ac-display text-3xl sm:text-4xl">{t.title}</h1>
            <p className="text-muted-foreground mt-2">{t.text}</p>
            <p className="mt-3 font-mono text-sm font-semibold">{id}</p>
          </div>
        </div>

        {showDetails && (
          <dl className="mt-6 divide-y border-t">
            <Row label="Awarded to">{result.name_withdrawn ? <span className="text-muted-foreground">Name withdrawn at the holder&apos;s request</span> : result.recipient_name}</Row>
            <Row label={KINDS[result.kind]?.label ?? "Course"}>{result.course_title}</Row>
            <Row label="Course code"><span className="font-mono">{result.course_code}</span></Row>
            <Row label="Issued by">{result.issuing_organization}</Row>
            <Row label="Mentor">{result.mentor_name}</Row>
            <Row label="Issue date">{formatDateLong(result.issue_date)}</Row>
            <Row label="Completed on">{formatDateLong(result.completion_date)}</Row>
            <Row label="Duration">{result.program_duration}</Row>
            <Row label="Skills demonstrated">{Array.isArray(result.skills) && result.skills.length ? result.skills.join(", ") : null}</Row>
            <Row label="Project">{result.project_title && (result.project_url ? <a href={result.project_url} target="_blank" rel="noopener noreferrer nofollow ugc" className="text-primary-text inline-flex items-center gap-1 underline">{result.project_title}<ExternalLink className="size-3.5" aria-hidden /></a> : result.project_title)}</Row>
            <Row label="Assessment score">{Number.isFinite(Number(result.score_pct)) && result.score_pct !== null ? `${result.score_pct}%` : null}</Row>
            {status === "revoked" && <Row label="Revoked on">{result.revoked_at ? new Date(result.revoked_at).toLocaleDateString("en-IN", { dateStyle: "long", timeZone: "Asia/Kolkata" }) : null}</Row>}
            {status === "revoked" && <Row label="Why">{result.revoked_note}</Row>}
            {status === "revoked" && result.replaced_by && <Row label="Replaced by"><Link className="text-primary-text font-mono underline" href={`/academy/verify/${result.replaced_by}`}>{result.replaced_by}</Link></Row>}
          </dl>
        )}

        <div className="ac-noprint mt-6 flex flex-wrap items-center gap-3 border-t pt-5 text-sm">
          {showDetails && <PrintButton />}
          <span className="text-muted-foreground">Checked just now from the issuer&apos;s own records.</span>
        </div>
      </section>

      <p className="text-muted-foreground mt-5 text-sm">
        This page shows only what the holder agreed to share. {settings.supportEmail ? <>Think something is wrong? <a className="text-primary-text underline" href={`mailto:${settings.supportEmail}?subject=Disputed%20certificate%20${encodeURIComponent(id)}`}>Report this certificate</a>.</> : <>Think something is wrong? <Link className="text-primary-text underline" href="/contact">Contact us</Link> with the ID.</>}
      </p>
      <div className="ac-noprint mt-10 border-t pt-8"><h2 className="ac-display text-xl">Check another</h2><div className="mt-3"><VerifyForm /></div></div>
    </div>
  );
}
