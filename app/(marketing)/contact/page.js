import { ContactForm } from "@/components/marketing/contact-form";
import { getPublicSettings } from "@/lib/settings";

export const metadata = {
  title: "Contact",
  description: "Questions, support requests or partnership ideas? Get in touch with the UniSphere team.",
  alternates: { canonical: "/contact" },
};

export default async function ContactPage() {
  const { support_email } = await getPublicSettings();
  return (
    <div className="mx-auto max-w-2xl px-4 py-14 sm:px-6 sm:py-20">
      <p className="eyebrow mb-2">Contact</p>
      <h1 className="text-4xl font-extrabold">Get in touch</h1>
      <p className="text-muted-foreground mt-3 text-lg">
        Tell us what you need and we will reply by email.
        {support_email && (
          <>
            {" "}
            You can also write to <a className="text-primary underline underline-offset-2" href={`mailto:${support_email}`}>{support_email}</a>.
          </>
        )}
      </p>
      <div className="mt-8">
        <ContactForm />
      </div>
    </div>
  );
}
