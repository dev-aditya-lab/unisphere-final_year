import { VerifyForm } from "@/components/academy/verify-form";
import { getAcademySettings } from "@/lib/services/academy";

export const metadata = {
  title: "Verify a certificate",
  description: "Check a UniSphere Academy certificate by its ID or QR code. The page says whether it is valid, revoked or unknown.",
  alternates: { canonical: "/academy/verify" },
};

export default async function VerifyPage() {
  const settings = await getAcademySettings();
  return (
    <>
      <section className="ac-band">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <div className="ac-stagger max-w-3xl">
            <p className="ac-kicker" style={{ "--i": 0 }}>Verification</p>
            <h1 className="ac-display mt-4 text-[clamp(2.4rem,5vw,4rem)]" style={{ "--i": 1 }}>Verify a certificate</h1>
            <p className="mt-4 text-lg text-[#c3c7e6]" style={{ "--i": 2 }}>Enter the ID printed on the certificate, or scan its QR code. No account is needed.</p>
          </div>
        </div>
      </section>
      <div className="mx-auto grid max-w-6xl gap-12 px-4 py-14 sm:px-6 lg:grid-cols-2">
        <div className="ac-card p-6 sm:p-8"><VerifyForm /></div>
        <div className="text-muted-foreground space-y-4 text-[15px]">
          <h2 className="ac-display text-foreground text-2xl">What you will see</h2>
          <ul className="list-disc space-y-2 pl-5">
            <li><strong className="text-foreground">Valid.</strong> The certificate exists in our records and has not been revoked.</li>
            <li><strong className="text-foreground">Revoked.</strong> It was issued but later withdrawn. The page says when.</li>
            <li><strong className="text-foreground">Not found.</strong> No certificate has this ID. Check it for typing mistakes.</li>
            <li><strong className="text-foreground">Not available.</strong> It is still being prepared.</li>
          </ul>
          <p>The page shows the holder&apos;s name, the course, the dates and the issuing organisation. It shows a score or a project link only if the holder chose to share them. It never shows contact details.</p>
          <p>
            Think a certificate is wrong or forged? {settings.supportEmail ? <>Write to <a className="text-primary-text underline" href={`mailto:${settings.supportEmail}?subject=Disputed%20certificate`}>{settings.supportEmail}</a> with the ID.</> : <>Tell us through the <a className="text-primary-text underline" href="/contact">contact page</a>, with the ID.</>}
          </p>
        </div>
      </div>
    </>
  );
}
