import Link from "next/link";
import { Download } from "lucide-react";
import { Scale } from "@/components/icons/lucide-compat";
import { Pencil, ShieldOff, Trash2, UserRoundCheck } from "@/components/icons/lucide-compat";
import { SettingsShell } from "@/components/settings/settings-nav";
import { CorrectionForm, NominationForm, OtherRequestForm } from "@/components/privacy/request-forms";
import { RequestStatusBadge, fmtDate } from "@/components/privacy/request-status";
import { requireProfile } from "@/lib/auth/session";
import { getMyNomination, listMyRequests } from "@/lib/privacy/requests";
import { CORRECTABLE_FIELDS, REQUEST_KINDS } from "@/lib/privacy/registry";
import { privacyContact } from "@/lib/privacy/config";

export const metadata = { title: "Your data and privacy requests", robots: { index: false, follow: false } };

function Card({ id, icon: Icon, title, children }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="surface scroll-mt-24 p-5 sm:p-6">
      <h2 id={`${id}-h`} className="flex items-center gap-2 text-lg font-bold">
        <Icon className="text-muted-foreground size-5" aria-hidden="true" /> {title}
      </h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}

export default async function PrivacyRequestsPage() {
  await requireProfile({ allowIncomplete: true });
  const [requests, nomination] = await Promise.all([listMyRequests(), getMyNomination()]);

  return (
    <SettingsShell>
      <p className="text-muted-foreground mb-6 text-sm leading-relaxed">
        Use your rights over your personal data here: get a copy, correct it, delete it, change your consents, name someone to act for you, or complain. Everything you ask for is recorded with a reference number, and you can follow it below. Questions: {privacyContact.name},{" "}
        <a className="text-blue-text underline" href={`mailto:${privacyContact.email}`}>{privacyContact.email}</a>.
      </p>

      <div className="space-y-6">
        <Card id="copy" icon={Download} title="Get a copy of my data">
          <p className="text-muted-foreground text-sm leading-relaxed">
            A JSON file with the profile, posts, comments, projects, messages you sent, Orbits, consents and requests that are yours, plus a plain description of what UniSphere collects, why, and which providers handle it. It never includes other people&rsquo;s content. You can do this three times an hour.
          </p>
          <a href="/api/account/export" download className="bg-primary text-primary-foreground hover:bg-primary/90 mt-3 inline-flex h-9 items-center rounded-md px-4 text-sm font-semibold">
            Download my data
          </a>
        </Card>

        <Card id="correct" icon={Pencil} title="Correct my data">
          <p className="text-muted-foreground text-sm leading-relaxed">
            Most details you can change yourself in <Link href="/settings/profile" className="text-blue-text underline">your profile</Link>. For things you cannot edit (your sign-in email, a locked username, the name on a blue tick, or a record we hold), ask here and a person will handle it.
          </p>
          <div className="mt-4">
            <CorrectionForm fieldOptions={CORRECTABLE_FIELDS} />
          </div>
        </Card>

        <Card id="consent" icon={ShieldOff} title="Withdraw or change a consent">
          <p className="text-muted-foreground text-sm leading-relaxed">
            Each optional use of your information has its own switch, and turning one off is as easy as turning it on. <Link href="/settings/privacy#consents" className="text-blue-text underline">Open your privacy choices</Link>. To withdraw the consent your account rests on, <Link href="/delete-account" className="text-blue-text underline">delete your account</Link>.
          </p>
        </Card>

        <Card id="delete" icon={Trash2} title="Delete my account and data">
          <p className="text-muted-foreground text-sm leading-relaxed">
            You confirm with your password, have 14 days to change your mind, and then your account and data are erased. We tell you what is erased and what the law makes us keep.
          </p>
          <Link href="/delete-account" className="text-blue-text mt-3 inline-block text-sm font-semibold underline">Start or review a deletion</Link>
        </Card>

        <Card id="nominate" icon={UserRoundCheck} title="Nominate someone to act for me">
          <p className="text-muted-foreground text-sm leading-relaxed">
            You can name a person who may exercise your rights over your data if you die or can no longer act for yourself. UniSphere stores their name and email only to recognise them if they ever contact us, and does not contact them: please tell them yourself. We will check who they are, and the circumstances, before acting on a claim.
          </p>
          <div className="mt-4">
            <NominationForm nomination={nomination} />
          </div>
        </Card>

        <Card id="complain" icon={Scale} title="Complain, or ask something else">
          <p className="text-muted-foreground text-sm leading-relaxed">
            Something wrong with how your data was handled? <Link href="/grievance" className="text-blue-text underline">Make a grievance</Link>: you get a reference, and we aim to reply within {privacyContact.responseTarget}. For anything else about privacy, use this form.
          </p>
          <div className="mt-4">
            <OtherRequestForm />
          </div>
        </Card>

        <section id="mine" aria-labelledby="mine-h" className="surface scroll-mt-24 p-5 sm:p-6">
          <h2 id="mine-h" className="text-lg font-bold">Your requests</h2>
          {requests.length === 0 ? (
            <p className="text-muted-foreground mt-2 text-sm">Nothing yet. Requests you make appear here with their progress.</p>
          ) : (
            <ul className="mt-3 divide-y">
              {requests.map((r) => (
                <li key={r.id}>
                  <Link href={`/privacy-requests/${r.id}`} className="hover:bg-muted/50 -mx-2 flex flex-wrap items-center justify-between gap-2 rounded-md px-2 py-3">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{r.subject}</span>
                      <span className="text-muted-foreground block text-xs">
                        {r.reference} · {REQUEST_KINDS[r.kind]?.label ?? r.kind} · {fmtDate(r.created_at)}
                        {!r.closed_at && <> · we aim to reply by {fmtDate(r.due_at)}</>}
                      </span>
                    </span>
                    <RequestStatusBadge status={r.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </SettingsShell>
  );
}
