"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/forms/field";
import { FormAlert } from "@/components/forms/form-alert";
import { SubmitButton } from "@/components/forms/submit-button";
import { submitGrievanceAction, trackGrievanceAction } from "@/lib/actions/privacy";
import { REQUEST_STATUS } from "@/lib/privacy/registry";

const fmt = (iso) => new Intl.DateTimeFormat("en-IN", { dateStyle: "long", timeZone: "Asia/Kolkata" }).format(new Date(iso));
const fmtT = (iso) => new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(iso));

/** Open to everyone. Signed-in members need no email: the grievance is attached to their account and tracked there. */
export function GrievanceForm({ signedIn, responseTarget, maxDays }) {
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState({ subject: "", details: "", name: "", email: "", website: "" });
  const [error, setError] = useState(null);
  const [fields, setFields] = useState({});
  const [done, setDone] = useState(null);
  const set = (k) => (e) => setValues((v) => ({ ...v, [k]: e.target.value }));

  function submit(e) {
    e.preventDefault();
    setError(null);
    setFields({});
    const payload = signedIn ? { ...values, email: undefined, name: undefined } : { ...values, email: values.email || undefined };
    startTransition(async () => {
      const res = await submitGrievanceAction(payload);
      if (res.ok) setDone(res);
      else {
        setError(res.error);
        setFields(res.fieldErrors ?? {});
      }
    });
  }

  if (done) {
    return (
      <div className="surface p-6" role="status">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="text-success-text mt-0.5 size-6 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <p className="font-semibold">We have your grievance</p>
            <p className="mt-1 text-sm">
              Reference: <strong className="font-mono">{done.reference}</strong>
            </p>
            {done.member ? (
              <p className="text-muted-foreground mt-2 text-sm">
                Follow it in <Link href={`/privacy-requests/${done.id}`} className="text-blue-text underline">your privacy requests</Link>. We aim to reply by {fmt(done.dueAt)}.
              </p>
            ) : (
              <>
                {done.code && (
                  <p className="mt-2 text-sm">
                    Tracking code: <strong className="font-mono tracking-wider">{done.code}</strong>
                  </p>
                )}
                <p className="text-muted-foreground mt-2 text-sm">
                  Write the reference and code down. We also emailed them to you. Use them on the <Link href="/grievance/track" className="text-blue-text underline">tracking page</Link>.{" "}
                  {done.dueAt ? <>We aim to reply by {fmt(done.dueAt)}.</> : null}
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="relative space-y-4">
      {error && <FormAlert>{error}</FormAlert>}
      <Field id="g-subject" label="Title" error={fields.subject} required>
        <Input id="g-subject" maxLength={140} value={values.subject} onChange={set("subject")} aria-invalid={Boolean(fields.subject)} aria-describedby="g-subject-desc" />
      </Field>
      <Field id="g-details" label="What happened?" error={fields.details} hint="Say what happened, when, and what you would like us to do. Do not include your password." required>
        <Textarea id="g-details" rows={6} maxLength={4000} value={values.details} onChange={set("details")} aria-invalid={Boolean(fields.details)} aria-describedby="g-details-desc" />
      </Field>
      {!signedIn && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="g-name" label="Your name" optional>
            <Input id="g-name" autoComplete="name" maxLength={120} value={values.name} onChange={set("name")} />
          </Field>
          <Field id="g-email" label="Your email address" error={fields.email} hint="So we can reply. It is used only for this grievance." required>
            <Input id="g-email" type="email" autoComplete="email" maxLength={254} value={values.email} onChange={set("email")} aria-invalid={Boolean(fields.email)} aria-describedby="g-email-desc" />
          </Field>
        </div>
      )}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="g-website">Leave this empty</label>
        <input id="g-website" tabIndex={-1} autoComplete="off" value={values.website} onChange={set("website")} />
      </div>
      <p className="text-muted-foreground text-xs leading-relaxed">
        {signedIn ? "This is attached to your account." : "You do not need an account."} We aim to reply within {responseTarget} and commit to resolving it within {maxDays} days. We use what you write only to deal with it, and keep it for the period in the privacy notice.
      </p>
      <SubmitButton pending={pending} pendingText="Sending…">Send grievance</SubmitButton>
    </form>
  );
}

export function TrackForm() {
  const [pending, startTransition] = useTransition();
  const [reference, setReference] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  function submit(e) {
    e.preventDefault();
    setError(null);
    setResult(null);
    startTransition(async () => {
      const res = await trackGrievanceAction({ reference, code });
      if (res.ok) setResult(res.grievance);
      else setError(res.fieldErrors?.reference ?? res.error);
    });
  }

  return (
    <div>
      <form onSubmit={submit} noValidate className="space-y-4">
        {error && <FormAlert>{error}</FormAlert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="t-ref" label="Reference" hint="Looks like GR-2026-000123" required>
            <Input id="t-ref" autoComplete="off" value={reference} onChange={(e) => setReference(e.target.value)} aria-describedby="t-ref-desc" />
          </Field>
          <Field id="t-code" label="Tracking code" hint="From the email we sent you" required>
            <Input id="t-code" autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} aria-describedby="t-code-desc" />
          </Field>
        </div>
        <SubmitButton pending={pending} pendingText="Looking…">Check progress</SubmitButton>
      </form>
      {result && (
        <section className="surface mt-6 p-5" aria-live="polite" aria-labelledby="t-result">
          <h2 id="t-result" className="text-lg font-bold">
            {result.reference}: {REQUEST_STATUS[result.status]?.label ?? result.status}
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            {REQUEST_STATUS[result.status]?.hint} Sent {fmt(result.created_at)}.{!result.closed_at && <> We aim to reply by {fmt(result.due_at)}.</>}
          </p>
          {result.outcome_reason && <p className="mt-3 text-sm whitespace-pre-wrap">{result.outcome_reason}</p>}
          <ol className="mt-4 space-y-3" aria-label="History">
            {result.events.map((ev, i) => (
              <li key={i} className="border-l-2 pl-4">
                <p className="text-sm font-semibold">
                  {REQUEST_STATUS[ev.status]?.label ?? ev.status} <span className="text-muted-foreground ml-2 text-xs font-normal">{fmtT(ev.at)}</span>
                </p>
                {ev.note && <p className="text-muted-foreground mt-0.5 text-[13px] whitespace-pre-wrap">{ev.note}</p>}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
