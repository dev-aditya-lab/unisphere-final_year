import { ContactForm } from "@/components/marketing/contact-form";
import { getPublicSettings } from "@/lib/settings";
import { subjectFromSlug } from "@/lib/content/contact-topics";
import Link from "next/link";
import { REQUEST_HANDLER, RESPONSE_TARGET } from "@/lib/constants";
import { business } from "@/lib/business";

export const metadata = {
  title: "Contact",
  description: "Questions, support requests or partnership ideas? Get in touch with the UniSphere team.",
  alternates: { canonical: "/contact" },
};

export default async function ContactPage({ searchParams }) {
  const [{ support_email }, sp] = await Promise.all([getPublicSettings(), searchParams]);
  const topic = typeof sp?.topic === "string" ? sp.topic : "";
  return (
    <div className="mx-auto max-w-2xl px-4 py-14 sm:px-6 sm:py-20">
      <p className="eyebrow mb-2">Contact</p>
      <h1 className="text-4xl font-extrabold">Get in touch</h1>
      <p className="text-muted-foreground mt-3 text-lg">
        Tell us what you need and we will reply by email.
        {support_email && (
          <>
            {" "}
            You can also write to <a className="text-blue-text underline underline-offset-2" href={`mailto:${support_email}`}>{support_email}</a>.
          </>
        )}
      </p>
      <p className="text-muted-foreground mt-3 text-sm">
        Privacy, copyright and content requests are handled by {REQUEST_HANDLER}. We aim to reply within {RESPONSE_TARGET}.
      </p>
      <div className="mt-8">
        <ContactForm key={topic} defaultSubject={subjectFromSlug(topic)} />
      </div>

      {/* Who runs the service and how to reach them. Only what has been configured is shown (lib/business.js). */}
      <section aria-labelledby="business-details" className="surface mt-10 p-5 sm:p-6">
        <h2 id="business-details" className="font-heading text-xl font-extrabold">
          Business details
        </h2>
        <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-3 text-[15px] sm:grid-cols-[10rem_1fr]">
          <dt className="text-muted-foreground font-semibold">Service</dt>
          <dd>{business.name}</dd>
          {business.legalName && (
            <>
              <dt className="text-muted-foreground font-semibold">Operated by</dt>
              <dd>{business.legalName}</dd>
            </>
          )}
          {business.addressLines.length > 0 && (
            <>
              <dt className="text-muted-foreground font-semibold">Address</dt>
              <dd>
                {business.addressLines.map((line) => (
                  <span key={line} className="block">
                    {line}
                  </span>
                ))}
              </dd>
            </>
          )}
          <dt className="text-muted-foreground font-semibold">Email</dt>
          <dd>
            <a className="text-blue-text underline underline-offset-2" href={`mailto:${business.email}`}>
              {business.email}
            </a>
          </dd>
          {business.phone && (
            <>
              <dt className="text-muted-foreground font-semibold">Phone</dt>
              <dd>
                <a className="text-blue-text underline underline-offset-2" href={`tel:${business.phone.replace(/[^+\d]/g, "")}`}>
                  {business.phone}
                </a>
              </dd>
            </>
          )}
          {business.gstin && (
            <>
              <dt className="text-muted-foreground font-semibold">GSTIN</dt>
              <dd>{business.gstin}</dd>
            </>
          )}
          <dt className="text-muted-foreground font-semibold">Grievance officer</dt>
          <dd>
            {business.grievanceOfficer}, reachable at the email above. Complaints about content, accounts or privacy are acknowledged and answered as described in the{" "}
            <Link href="/content-policy" className="text-blue-text underline underline-offset-2">
              content policy
            </Link>
            .
          </dd>
        </dl>
        <p className="text-muted-foreground mt-4 text-sm">
          Pricing, refunds and delivery:{" "}
          <Link href="/pricing" className="text-blue-text underline underline-offset-2">
            pricing
          </Link>
          ,{" "}
          <Link href="/refund-policy" className="text-blue-text underline underline-offset-2">
            refund and cancellation
          </Link>
          ,{" "}
          <Link href="/shipping-policy" className="text-blue-text underline underline-offset-2">
            shipping and delivery
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
