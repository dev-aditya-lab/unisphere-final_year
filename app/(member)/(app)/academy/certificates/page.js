import Link from "next/link";
import { Award, Download, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CopyButton } from "@/components/academy/copy-button";
import { ConsentButton } from "@/components/academy/commerce/student-actions";
import { EmptyBlock } from "@/components/academy/ui/section";
import { formatDateLong } from "@/lib/academy/cert-vars";
import { verifyUrl } from "@/lib/academy/urls";
import { requireProfile } from "@/lib/auth/session";
import { getCertificateProgress, getMyCertificates, getMyEnrollments } from "@/lib/services/academy";
import { CertificateProgress } from "@/components/academy/member/certificate-progress";

export const metadata = { title: "Certificates" };

export default async function CertificatesPage() {
  const { user } = await requireProfile();
  const [certs, enrollments, progress] = await Promise.all([getMyCertificates(user.id), getMyEnrollments(user.id), getCertificateProgress()]);
  const withCert = new Set(certs.map((c) => c.enrollment_id));
  const waiting = enrollments.filter((e) => e.status === "completed" && !withCert.has(e.id));

  return (
    <div className="space-y-8 py-8">
      <header><h1 className="font-heading text-3xl font-extrabold">Certificates</h1><p className="text-muted-foreground mt-1">Proof of what you completed. Anyone can check a certificate with its ID or QR code.</p></header>

      {progress.length > 0 && (
        <section aria-labelledby="coming" className="space-y-3">
          <h2 id="coming" className="ac-display text-2xl">Coming up</h2>
          <p className="text-muted-foreground text-sm">Your certificates are issued automatically the moment every step is done. This is what is left.</p>
          <CertificateProgress items={progress} />
        </section>
      )}

      {waiting.length > 0 && (
        <section aria-label="Waiting for a certificate" className="space-y-3">
          {waiting.map((e) => {
            const manual = e.course.certificate_criteria?.manual_approval && !e.certificate_approved_at;
            return (
              <div key={e.id} className="ac-card flex flex-wrap items-center justify-between gap-3 p-5">
                <div><p className="font-semibold">{e.course.title}</p><p className="text-muted-foreground text-sm">{!e.verify_consent_at ? "You finished. One step is left for us to issue it." : manual ? "You finished. A mentor will approve your certificate, then it is issued." : "You finished. The Academy team issues certificates shortly after completion; you will be notified."}</p></div>
                {!e.verify_consent_at && <ConsentButton enrollmentId={e.id} />}
              </div>
            );
          })}
        </section>
      )}

      {certs.length === 0 ? (
        <EmptyBlock title="No certificates yet" action={<Button asChild><Link href="/academy/my-learning">Continue learning</Link></Button>}>Finish a course and meet its requirements, and your certificate appears here.</EmptyBlock>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {certs.map((c) => {
            const url = verifyUrl(c.certificate_id);
            return (
              <li key={c.id} className="ac-card overflow-hidden">
                <div className="bg-muted/50 border-b p-5">
                  <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-bold tracking-widest uppercase"><Award className="size-4" aria-hidden />Certificate of completion</p>
                  <p className="font-heading mt-2 text-2xl font-extrabold">{c.snapshot?.recipient_name}</p>
                  <p className="text-muted-foreground mt-1 text-sm">{c.snapshot?.course_title}</p>
                </div>
                <div className="space-y-3 p-5 text-sm">
                  <div className="flex flex-wrap items-center gap-2"><span className="font-mono">{c.certificate_id}</span><Badge variant={c.status === "issued" ? "success" : "danger"}>{c.status === "issued" ? "Valid" : "Revoked"}</Badge></div>
                  <p className="text-muted-foreground">Issued {formatDateLong(c.snapshot?.issue_date)}{c.status === "revoked" && c.revoke_public_note ? ` · ${c.revoke_public_note}` : ""}</p>
                  <div className="flex flex-wrap gap-2">
                    {c.status === "issued" && c.pdf_key && <Button asChild size="sm"><a href={`/api/academy/certificates/${c.id}/pdf`}><Download aria-hidden />Download PDF</a></Button>}
                    <Button asChild variant="outline" size="sm"><Link href={`/academy/verify/${c.certificate_id}`}><ExternalLink aria-hidden />Verification page</Link></Button>
                    <CopyButton value={url} />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-muted-foreground text-sm">Choose what the verification page shows, and your certificate name, in <Link className="text-primary-text underline" href="/settings/academy">Settings, Academy</Link>.</p>
    </div>
  );
}
