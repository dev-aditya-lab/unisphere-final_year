"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field } from "@/components/forms/field";
import { SubmitButton } from "@/components/forms/submit-button";
import { FormAlert } from "@/components/forms/form-alert";
import {
  cancelPrivacyRequestAction, replyToPrivacyRequestAction, requestCorrectionAction, revokeNominationAction, setNominationAction, submitOtherRequestAction,
} from "@/lib/actions/privacy";

/** Runs a Server Action, shows the outcome, and refreshes the page data. Returns { error, fields, pending, run }. */
function useAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(null);
  const [fields, setFields] = useState({});
  const [done, setDone] = useState(null);
  function run(fn, { onOk } = {}) {
    setError(null);
    setFields({});
    setDone(null);
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        setDone(res.reference ? `Sent. Your reference is ${res.reference}.` : (res.message ?? "Done."));
        toast.success(res.reference ? `Sent (${res.reference})` : (res.message ?? "Done."));
        onOk?.(res);
        router.refresh();
      } else {
        setError(res.error);
        setFields(res.fieldErrors ?? {});
      }
    });
  }
  return { pending, error, fields, done, run };
}

export function CorrectionForm({ fieldOptions }) {
  const a = useAction();
  const [field, setField] = useState(fieldOptions[0].value);
  const [current, setCurrent] = useState("");
  const [requested, setRequested] = useState("");
  const [details, setDetails] = useState("");
  const reset = () => { setCurrent(""); setRequested(""); setDetails(""); };
  return (
    <form
      noValidate
      onSubmit={(e) => { e.preventDefault(); a.run(() => requestCorrectionAction({ field, current, requested, details }), { onOk: reset }); }}
      className="space-y-4"
    >
      {a.error && <FormAlert>{a.error}</FormAlert>}
      {a.done && <FormAlert variant="success">{a.done}</FormAlert>}
      <Field id="corr-field" label="What needs correcting?">
        <Select value={field} onValueChange={setField}>
          <SelectTrigger id="corr-field" className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>{fieldOptions.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
        </Select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="corr-current" label="What it says now" optional>
          <Input id="corr-current" maxLength={300} value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <Field id="corr-requested" label="What it should say" error={a.fields.requested} required>
          <Input id="corr-requested" maxLength={300} value={requested} onChange={(e) => setRequested(e.target.value)} aria-invalid={Boolean(a.fields.requested)} aria-describedby="corr-requested-desc" />
        </Field>
      </div>
      <Field id="corr-details" label="Anything else we should know" error={a.fields.details} hint="We may ask you to confirm it is you before we change anything." required>
        <Textarea id="corr-details" rows={3} maxLength={3000} value={details} onChange={(e) => setDetails(e.target.value)} aria-invalid={Boolean(a.fields.details)} aria-describedby="corr-details-desc" />
      </Field>
      <SubmitButton pending={a.pending} pendingText="Sending…">Send correction request</SubmitButton>
    </form>
  );
}

export function OtherRequestForm() {
  const a = useAction();
  const [subject, setSubject] = useState("");
  const [details, setDetails] = useState("");
  return (
    <form
      noValidate
      onSubmit={(e) => { e.preventDefault(); a.run(() => submitOtherRequestAction({ subject, details }), { onOk: () => { setSubject(""); setDetails(""); } }); }}
      className="space-y-4"
    >
      {a.error && <FormAlert>{a.error}</FormAlert>}
      {a.done && <FormAlert variant="success">{a.done}</FormAlert>}
      <Field id="other-subject" label="Title" error={a.fields.subject} required>
        <Input id="other-subject" maxLength={140} value={subject} onChange={(e) => setSubject(e.target.value)} aria-invalid={Boolean(a.fields.subject)} aria-describedby="other-subject-desc" />
      </Field>
      <Field id="other-details" label="What would you like to ask or tell us?" error={a.fields.details} required>
        <Textarea id="other-details" rows={4} maxLength={4000} value={details} onChange={(e) => setDetails(e.target.value)} aria-invalid={Boolean(a.fields.details)} aria-describedby="other-details-desc" />
      </Field>
      <SubmitButton pending={a.pending} pendingText="Sending…">Send</SubmitButton>
    </form>
  );
}

export function NominationForm({ nomination }) {
  const a = useAction();
  const [name, setName] = useState(nomination?.nominee_name ?? "");
  const [email, setEmail] = useState(nomination?.nominee_email ?? "");
  const [relationship, setRelationship] = useState(nomination?.relationship ?? "");
  return (
    <div className="space-y-4">
      {a.error && <FormAlert>{a.error}</FormAlert>}
      {a.done && <FormAlert variant="success">{a.done}</FormAlert>}
      <form noValidate onSubmit={(e) => { e.preventDefault(); a.run(() => setNominationAction({ name, email, relationship })); }} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="nom-name" label="Their full name" error={a.fields.name} required>
            <Input id="nom-name" maxLength={120} autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={Boolean(a.fields.name)} aria-describedby="nom-name-desc" />
          </Field>
          <Field id="nom-email" label="Their email address" error={a.fields.email} required>
            <Input id="nom-email" type="email" maxLength={254} autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={Boolean(a.fields.email)} aria-describedby="nom-email-desc" />
          </Field>
        </div>
        <Field id="nom-rel" label="Who are they to you?" optional>
          <Input id="nom-rel" maxLength={80} value={relationship} onChange={(e) => setRelationship(e.target.value)} />
        </Field>
        <div className="flex flex-wrap gap-2">
          <SubmitButton pending={a.pending} pendingText="Saving…">{nomination ? "Update nomination" : "Save nomination"}</SubmitButton>
          {nomination && (
            <Button type="button" variant="outline" disabled={a.pending} onClick={() => a.run(() => revokeNominationAction(), { onOk: () => { setName(""); setEmail(""); setRelationship(""); } })}>
              Remove nomination
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}

export function CancelRequestButton({ id }) {
  const a = useAction();
  return (
    <>
      <Button type="button" variant="outline" size="sm" disabled={a.pending} onClick={() => a.run(() => cancelPrivacyRequestAction({ id }))}>
        {a.pending ? "Withdrawing…" : "Withdraw this request"}
      </Button>
      {a.error && <p role="alert" className="text-destructive-text mt-2 text-xs">{a.error}</p>}
    </>
  );
}

export function ReplyForm({ id }) {
  const a = useAction();
  const [message, setMessage] = useState("");
  return (
    <form noValidate onSubmit={(e) => { e.preventDefault(); a.run(() => replyToPrivacyRequestAction({ id, message }), { onOk: () => setMessage("") }); }} className="space-y-3">
      {a.error && <FormAlert>{a.error}</FormAlert>}
      <Field id="reply" label="Add a message" error={a.fields.message}>
        <Textarea id="reply" rows={3} maxLength={2000} value={message} onChange={(e) => setMessage(e.target.value)} aria-invalid={Boolean(a.fields.message)} aria-describedby="reply-desc" />
      </Field>
      <SubmitButton pending={a.pending} pendingText="Sending…" size="sm">Send</SubmitButton>
    </form>
  );
}
