import { ContactForm } from "@/components/marketing/contact-form";
import { getPublicSettings } from "@/lib/settings";
import { subjectFromSlug } from "@/lib/content/contact-topics";
import { REQUEST_HANDLER, RESPONSE_TARGET } from "@/lib/constants";

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
    </div>
  );
}
