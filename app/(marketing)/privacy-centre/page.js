import Link from "next/link";
import { Download, FileText, Pencil, Scale, ShieldCheck, ShieldOff, Trash2, UserRoundCheck, Mail, Cookie, Users } from "lucide-react";
import { getAuthUser } from "@/lib/auth/session";
import { privacyContact } from "@/lib/privacy/config";
import { CURRENT_NOTICE } from "@/lib/privacy/registry";

export const metadata = {
  title: "Privacy centre",
  description: "Every UniSphere privacy page and tool in one place: the notice and policy, your rights, requests, deletion and complaints.",
  alternates: { canonical: "/privacy-centre" },
};

const date = (iso) => new Intl.DateTimeFormat("en-IN", { dateStyle: "long", timeZone: "Asia/Kolkata" }).format(new Date(iso));

function Tile({ href, icon: Icon, title, children, signIn }) {
  return (
    <Link href={href} className="surface hover:border-ring block p-5 transition-colors">
      <Icon className="text-muted-foreground size-5" aria-hidden="true" />
      <h3 className="font-heading mt-2 text-base font-bold">{title}</h3>
      <p className="text-muted-foreground mt-1 text-[13px] leading-relaxed">{children}</p>
      {signIn && <p className="text-muted-foreground mt-2 text-xs">Sign in required</p>}
    </Link>
  );
}

export default async function PrivacyCentrePage() {
  const user = await getAuthUser().catch(() => null);
  return (
    <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6 sm:py-20">
      <p className="eyebrow mb-2">Privacy</p>
      <h1 className="text-4xl font-extrabold">Privacy centre</h1>
      <p className="text-muted-foreground mt-4 max-w-2xl text-lg">
        What UniSphere does with your information, and every way to take control of it, in one place. {user ? "You are signed in, so each tool below opens directly." : "Tools marked sign in required open after you log in."}
      </p>

      <h2 className="font-heading mt-10 mb-3 text-xl font-extrabold">Read</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Tile href="/privacy-notice" icon={FileText} title="Privacy notice">The short, itemised version: what we collect, why, who handles it and how long we keep it.</Tile>
        <Tile href="/privacy" icon={ShieldCheck} title="Privacy policy">The full policy, including security, children, transfers and breaches.</Tile>
        <Tile href="/cookies" icon={Cookie} title="Cookies and storage">What your browser keeps. There are no tracking or advertising cookies.</Tile>
        <Tile href="/terms" icon={FileText} title="Terms of service">The agreement about using UniSphere. Separate from your privacy choices.</Tile>
        <Tile href="/guidelines" icon={Users} title="Community guidelines">How we expect people to treat each other, and how reports work.</Tile>
      </div>

      <h2 className="font-heading mt-10 mb-3 text-xl font-extrabold">Use your rights</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Tile href="/privacy-requests#copy" icon={Download} title="Request my data" signIn={!user}>Download a copy of your data and a plain description of how it is used.</Tile>
        <Tile href="/privacy-requests#correct" icon={Pencil} title="Correct my data" signIn={!user}>Edit your profile, or ask us to fix what you cannot edit.</Tile>
        <Tile href="/settings/privacy#consents" icon={ShieldOff} title="Withdraw consent" signIn={!user}>Turn off an optional use of your information, one purpose at a time.</Tile>
        <Tile href="/delete-account" icon={Trash2} title="Delete my account" signIn={!user}>Erase your account and data. You have 14 days to change your mind.</Tile>
        <Tile href="/privacy-requests#nominate" icon={UserRoundCheck} title="Nominate someone" signIn={!user}>Name a person who may act for you if you die or cannot.</Tile>
        <Tile href="/settings/privacy" icon={ShieldCheck} title="Privacy and consent settings" signIn={!user}>Profile visibility, who can message you, and your consent history.</Tile>
      </div>

      <h2 className="font-heading mt-10 mb-3 text-xl font-extrabold">Ask, or complain</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Tile href="/grievance" icon={Scale} title="Grievance">Open to everyone. You get a reference number and can follow what happens.</Tile>
        <Tile href="/grievance/track" icon={Scale} title="Track a grievance">Enter your reference and code to see the status.</Tile>
        <Tile href="/privacy-contact" icon={Mail} title="Contact the privacy team">Who answers, how to reach them, and how fast.</Tile>
      </div>

      <section className="surface mt-10 p-5 sm:p-6" aria-labelledby="status">
        <h2 id="status" className="font-heading text-lg font-extrabold">Where this stands in law</h2>
        <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
          India&rsquo;s Digital Personal Data Protection Act, 2023 and Rules, 2025 are being brought into force in stages. The Data Protection Board&rsquo;s rules took effect when the Rules were published in November 2025; the rules for Consent Managers apply from about November 2026; and most duties of a company like UniSphere, including notice, consent, security, breach reporting, retention and the rights described here, apply from about May 2027. UniSphere has built these tools ahead of that date. This is a description, not a promise that UniSphere meets every legal requirement: the work has not been reviewed by a lawyer or any regulator.
        </p>
        <p className="text-muted-foreground mt-3 text-xs">Current notice: version {CURRENT_NOTICE.version}, from {date(CURRENT_NOTICE.effectiveAt)}. Questions: {privacyContact.name}, <a className="text-blue-text underline" href={`mailto:${privacyContact.email}`}>{privacyContact.email}</a>.</p>
      </section>
    </div>
  );
}
