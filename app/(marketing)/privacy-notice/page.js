import Link from "next/link";
import { privacyContact } from "@/lib/privacy/config";
import { listProcessors } from "@/lib/privacy/processors";
import { CURRENT_NOTICE, DATA_CATEGORIES, ESSENTIAL_PURPOSES, MIN_AGE, NOTICE_VERSIONS, OPTIONAL_PURPOSES, PURPOSE_BY_KEY } from "@/lib/privacy/registry";
import { getSetting } from "@/lib/settings";
import { createAnonClient } from "@/lib/supabase/anon";

export const metadata = {
  title: "Privacy notice",
  description: "An itemised, plain-language notice of the personal data UniSphere collects, why, who handles it, how long it is kept and how to use your rights.",
  alternates: { canonical: "/privacy-notice" },
};

const date = (iso) => new Intl.DateTimeFormat("en-IN", { dateStyle: "long", timeZone: "Asia/Kolkata" }).format(new Date(iso));

function H2({ id, children }) {
  return (
    <h2 id={id} className="font-heading mt-12 mb-3 scroll-mt-24 text-2xl font-extrabold">
      {children}
    </h2>
  );
}

export default async function PrivacyNoticePage() {
  const retention = (await getSetting("privacy_retention")) ?? {};
  const processors = listProcessors();
  const { data: archived } = await createAnonClient().from("privacy_notice_versions").select("version, effective_at, summary").order("effective_at", { ascending: false });
  const versions = archived?.length ? archived : NOTICE_VERSIONS.map((v) => ({ version: v.version, effective_at: v.effectiveAt, summary: v.summary }));

  return (
    <article className="prose-uni mx-auto max-w-3xl px-4 py-14 sm:px-6 sm:py-20">
      <p className="eyebrow mb-2">Privacy</p>
      <h1 className="text-4xl font-extrabold">Privacy notice</h1>
      <p className="text-muted-foreground mt-4 text-lg">
        What UniSphere collects about you, why, who else handles it, how long it is kept, and what you can do about it. This page stands on its own: you do not need to read anything else to decide.
      </p>
      <p className="text-muted-foreground mt-2 text-sm">
        Version {CURRENT_NOTICE.version}, in effect from {date(CURRENT_NOTICE.effectiveAt)}. The longer <Link href="/privacy">privacy policy</Link> and your <Link href="/privacy-centre">privacy rights</Link> are linked from the privacy centre.
      </p>

      <H2 id="who">Who is asking</H2>
      <p>
        {privacyContact.entity ? <>UniSphere is run by {privacyContact.entity}. </> : <>UniSphere is run by the UniSphere team. </>}
        It decides why and how your information is used. Privacy questions, requests and grievances go to <strong>{privacyContact.name}</strong>,{" "}
        <a href={`mailto:${privacyContact.email}`}>{privacyContact.email}</a>
        {privacyContact.phone ? <>, {privacyContact.phone}</> : null}. {privacyContact.dpo ? <>The Data Protection Officer is {privacyContact.dpo.name}.</> : <>UniSphere has not appointed a Data Protection Officer.</>}
      </p>

      <H2 id="data">What we collect</H2>
      <p>
        Only the account details are needed to open an account. Everything else is something you choose to add or do. &ldquo;Required&rdquo; means we cannot run an account without it.
      </p>
      <div className="not-prose surface relative overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Personal data UniSphere collects, by category</caption>
          <thead className="bg-muted/50 text-muted-foreground text-xs">
            <tr>
              <th scope="col" className="px-4 py-2.5 font-semibold">What</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Items</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Needed?</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Why</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {DATA_CATEGORIES.map((c) => (
              <tr key={c.id} className="align-top">
                <th scope="row" className="px-4 py-3 font-semibold">{c.label}</th>
                <td className="px-4 py-3">
                  <ul className="list-disc space-y-1 pl-4">{c.items.map((i) => <li key={i}>{i}</li>)}</ul>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {c.required ? "Required" : "Optional"}
                  <span className="text-muted-foreground block text-xs">{PURPOSE_BY_KEY[c.purpose].kind === "optional" ? "Needs your consent" : ""}</span>
                </td>
                <td className="px-4 py-3">{c.use}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <H2 id="purposes">What you agree to, one thing at a time</H2>
      <p>The first two are needed for an account. Each of the others is off until you turn it on, is not needed to use UniSphere, and can be turned off again in one step.</p>
      <h3>Needed for an account</h3>
      <ul>
        {ESSENTIAL_PURPOSES.map((p) => (
          <li key={p.key}>
            <strong>{p.label}.</strong> {p.summary} <em>If you withdraw it:</em> {p.withdrawal}
          </li>
        ))}
      </ul>
      <h3>Optional</h3>
      <ul>
        {OPTIONAL_PURPOSES.map((p) => (
          <li key={p.key}>
            <strong>{p.label}.</strong> {p.summary} Needed only for {p.requiredFor}. <em>If you turn it off:</em> {p.withdrawal}
          </li>
        ))}
      </ul>
      <p>
        Accepting the Terms of Service is separate, and is never treated as one of these agreements. If this notice changes what any of them covers, you are told, and asked again where the law requires it; nothing is changed for you silently.
      </p>

      <H2 id="processors">Who else handles it</H2>
      <p>These providers work for UniSphere. The list is generated from what is switched on for this site right now.</p>
      <ul>
        {processors.map((p) => (
          <li key={p.id}>
            <strong>{p.name}</strong> ({p.role}). Receives: {p.receives} Why: {p.why}
            {p.consent && <> Only if you have allowed &ldquo;{PURPOSE_BY_KEY[p.consent].label}&rdquo;.</>}
          </li>
        ))}
      </ul>
      <p>
        Each provider handles information under its own terms, which UniSphere does not control, so UniSphere sends as little as it can. Some of them are outside India. UniSphere does not sell personal information and does not use your content to train any model of its own.
      </p>

      <H2 id="ai">AI features, exactly</H2>
      <ul>
        <li>Off until you allow them. Allowing is a separate, unticked choice; refusing costs you nothing else.</li>
        <li>Sent: the text you submit to an AI button, trimmed, with email addresses, phone numbers and ID-like numbers masked. For a summary: the already-visible post or discussion you asked about.</li>
        <li>Never sent: private messages, private or connections-only posts, identity documents, your email address or password.</li>
        <li>AI indexing (a separate choice) turns your public or college-visible posts, projects and profile summary into numeric embeddings. Turning it off deletes them.</li>
        <li>UniSphere does not claim any provider forgets what it receives. Check the provider&rsquo;s terms if that matters to you, or leave AI off.</li>
      </ul>

      <H2 id="keep">How long we keep it</H2>
      <div className="not-prose surface relative overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">How long each kind of record is kept</caption>
          <thead className="bg-muted/50 text-muted-foreground text-xs">
            <tr>
              <th scope="col" className="px-4 py-2.5 font-semibold">Record</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">How long, and why</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {[
              ["Your account, profile, posts, messages, files", "While your account is active. When you delete it: 14 days to change your mind, then erased."],
              ["Optional consents", "A record of each choice and its date is kept with your account and erased with it. Withdrawing stops the use at once."],
              ["Payment records (blue tick)", "Kept after deletion, as long as accounting and tax law require. UniSphere does not set that period itself."],
              ["Identity document (blue tick)", "Deleted as soon as the reviewer decides."],
              ["Reports about an account, with the content they quoted", `While the report is open. After the account is erased, cleared ${retention.closed_report_days ?? 365} days after the report is closed.`],
              ["Messages to the contact form", `Once resolved, removed ${retention.contact_message_days ?? 365} days after they were sent.`],
              ["Privacy requests and grievances", `Closed requests lose their text and contact details ${retention.closed_request_days ?? 365} days after closing. The reference, kind, status and dates stay.`],
              ["AI usage log (counts, task and time; never your text)", `${retention.ai_usage_log_days ?? 365} days.`],
              ["Record that an account was erased (an anonymous id)", `${retention.erasure_ledger_days ?? 365} days, so a restored backup cannot bring an erased account back.`],
              ["Audit log of staff actions (an anonymous id, no content)", "Kept, so decisions can be reviewed."],
              ["Backups held by the database provider", "Expire on the provider's schedule. They are not restored into the live service without re-applying every erasure."],
            ].map(([a, b]) => (
              <tr key={a} className="align-top">
                <th scope="row" className="px-4 py-3 font-semibold">{a}</th>
                <td className="px-4 py-3">{b}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>The day counts above are set by UniSphere&rsquo;s privacy team, are under review, and are shown as they are configured right now.</p>

      <H2 id="rights">Your rights, and how to use them</H2>
      <ul>
        <li><strong>Get a copy</strong> of your data and how it is used: <Link href="/privacy-requests#copy">Data &amp; requests</Link> (sign in).</li>
        <li><strong>Correct</strong> it: <Link href="/privacy-requests#correct">Data &amp; requests</Link>.</li>
        <li><strong>Delete</strong> it: <Link href="/delete-account">Delete my account</Link>.</li>
        <li><strong>Withdraw a consent</strong>: <Link href="/settings/privacy#consents">Privacy settings</Link>.</li>
        <li><strong>Nominate someone</strong> to act for you if you die or cannot: <Link href="/privacy-requests#nominate">Data &amp; requests</Link>.</li>
        <li><strong>Complain</strong>: <Link href="/grievance">the grievance form</Link>. Open to everyone, with a reference you can track.</li>
      </ul>
      <p>
        If you are not satisfied with our reply, you may complain to the Data Protection Board of India after using our grievance process. We aim to reply within {privacyContact.responseTarget} and will resolve a grievance within {privacyContact.grievanceMaxDays} days.
      </p>

      <H2 id="children">Children</H2>
      <p>
        UniSphere is for people aged {MIN_AGE} and over. You tell us that you are an adult when you sign up; we do not ask for a date of birth or an ID. We have no way to get a parent&rsquo;s verified consent, so we do not offer accounts to under-18s, and we never track or monitor children&rsquo;s behaviour or aim advertising at them.
      </p>

      <H2 id="versions">Earlier versions</H2>
      <ul>
        {versions.map((v) => (
          <li key={v.version}>
            <Link href={`/privacy-centre/versions/${v.version}`}>Version {v.version}</Link>, from {date(v.effective_at)}. {v.summary}
          </li>
        ))}
      </ul>
    </article>
  );
}
