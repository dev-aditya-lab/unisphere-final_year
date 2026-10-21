import Link from "next/link";
import { GrievanceForm } from "@/components/privacy/grievance-form";
import { getAuthUser } from "@/lib/auth/session";
import { privacyContact } from "@/lib/privacy/config";

export const metadata = {
  title: "Privacy grievances",
  description: "Raise a complaint about how UniSphere handles personal data. Open to everyone, with a reference number and status tracking.",
  alternates: { canonical: "/grievance" },
};

export default async function GrievancePage() {
  const user = await getAuthUser().catch(() => null);
  return (
    <div className="mx-auto max-w-2xl px-4 py-14 sm:px-6 sm:py-20">
      <p className="eyebrow mb-2">Privacy</p>
      <h1 className="text-4xl font-extrabold">Raise a privacy grievance</h1>
      <p className="text-muted-foreground mt-4 text-lg">
        Tell us what went wrong with your personal data, or with how we answered a request. A person reads every one. Open to everyone, with or without an account.
      </p>

      <section className="surface mt-8 p-5 sm:p-6" aria-labelledby="how">
        <h2 id="how" className="font-heading text-lg font-extrabold">What happens next</h2>
        <ol className="text-muted-foreground mt-2 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed">
          <li>You get a reference number straight away{user ? "" : ", and a code to follow it without an account"}.</li>
          <li>{privacyContact.name} reads it. We aim to reply within {privacyContact.responseTarget}, and will resolve it within {privacyContact.grievanceMaxDays} days.</li>
          <li>You can follow every step{user ? <> in <Link href="/privacy-requests#mine" className="text-blue-text underline">your privacy requests</Link></> : <> on the <Link href="/grievance/track" className="text-blue-text underline">tracking page</Link></>}, and we explain the outcome.</li>
          <li>If you are still not satisfied, you may complain to the Data Protection Board of India. The law asks you to use this process first. The Board publishes how to file a complaint.</li>
        </ol>
      </section>

      <div className="mt-8">
        <GrievanceForm signedIn={Boolean(user)} responseTarget={privacyContact.responseTarget} maxDays={privacyContact.grievanceMaxDays} />
      </div>

      <section className="mt-10 text-sm" aria-labelledby="contact">
        <h2 id="contact" className="font-heading text-lg font-extrabold">Prefer to write?</h2>
        <p className="text-muted-foreground mt-2">
          {privacyContact.name} ({privacyContact.title.toLowerCase()}): <a className="text-blue-text underline" href={`mailto:${privacyContact.email}`}>{privacyContact.email}</a>
          {privacyContact.phone ? <>, {privacyContact.phone}</> : null}. Emails are recorded the same way. For rights requests such as a copy of your data or deleting your account, <Link href="/privacy-centre" className="text-blue-text underline">use the privacy centre</Link>, which is faster. Already have a reference? <Link href="/grievance/track" className="text-blue-text underline">Track it</Link>.
        </p>
      </section>
    </div>
  );
}
