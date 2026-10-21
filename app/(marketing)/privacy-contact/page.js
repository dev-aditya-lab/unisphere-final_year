import Link from "next/link";
import { privacyContact } from "@/lib/privacy/config";

export const metadata = {
  title: "Contact the privacy team",
  description: "Who answers questions about personal data at UniSphere, and how to reach them.",
  alternates: { canonical: "/privacy-contact" },
};

export default function PrivacyContactPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-14 sm:px-6 sm:py-20">
      <p className="eyebrow mb-2">Privacy</p>
      <h1 className="text-4xl font-extrabold">Contact the privacy team</h1>
      <p className="text-muted-foreground mt-4 text-lg">
        Questions about how your information is processed, or about using your rights, go to one named person.
      </p>

      <section className="surface mt-8 p-5 sm:p-6" aria-labelledby="who">
        <h2 id="who" className="font-heading text-lg font-extrabold">{privacyContact.name}</h2>
        <p className="text-muted-foreground text-sm">{privacyContact.title}</p>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex gap-3"><dt className="w-20 shrink-0 font-semibold">Email</dt><dd><a className="text-blue-text underline" href={`mailto:${privacyContact.email}`}>{privacyContact.email}</a></dd></div>
          {privacyContact.phone && <div className="flex gap-3"><dt className="w-20 shrink-0 font-semibold">Phone</dt><dd>{privacyContact.phone}</dd></div>}
          {privacyContact.entity && <div className="flex gap-3"><dt className="w-20 shrink-0 font-semibold">Run by</dt><dd>{privacyContact.entity}</dd></div>}
          {privacyContact.postal.length > 0 && (
            <div className="flex gap-3"><dt className="w-20 shrink-0 font-semibold">Address</dt><dd>{privacyContact.postal.map((l) => <span key={l} className="block">{l}</span>)}</dd></div>
          )}
          <div className="flex gap-3"><dt className="w-20 shrink-0 font-semibold">Reply</dt><dd>We aim to reply within {privacyContact.responseTarget}.</dd></div>
        </dl>
        <p className="text-muted-foreground mt-4 text-sm">
          {privacyContact.dpo ? `UniSphere has appointed ${privacyContact.dpo.name} as Data Protection Officer.` : "UniSphere has not appointed a Data Protection Officer; the person above answers instead."}
        </p>
      </section>

      <ul className="mt-8 space-y-2 text-sm">
        <li><Link href="/grievance" className="text-blue-text underline">Make a grievance</Link>: a complaint with a reference number and tracking.</li>
        <li><Link href="/privacy-centre" className="text-blue-text underline">Privacy centre</Link>: get, correct or delete your data, and change your consents.</li>
        <li><Link href="/contact?topic=privacy" className="text-blue-text underline">General contact form</Link>, topic Privacy.</li>
      </ul>
    </div>
  );
}
