"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Field } from "@/components/forms/field";
import { PasswordInput } from "@/components/forms/password-input";
import { SubmitButton } from "@/components/forms/submit-button";
import { FormAlert } from "@/components/forms/form-alert";
import { cancelAccountDeletionAction, requestAccountDeletionAction } from "@/lib/actions/privacy";

/** Re-confirmation with the password, the word DELETE, and an explicit choice about messages already sent. */
export function DeleteAccountForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [reason, setReason] = useState("");
  const [eraseMessages, setEraseMessages] = useState(false);
  const [error, setError] = useState(null);
  const [fields, setFields] = useState({});

  function submit(e) {
    e.preventDefault();
    setError(null);
    setFields({});
    startTransition(async () => {
      const res = await requestAccountDeletionAction({ password, confirm, reason, eraseMessages });
      if (res.ok) {
        toast.success(res.message);
        router.refresh();
      } else {
        setError(res.error);
        setFields(res.fieldErrors ?? {});
      }
    });
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {error && <FormAlert>{error}</FormAlert>}
      <Field id="del-password" label="Your password" error={fields.password} hint="We ask again so that nobody else can delete your account from a device you left signed in.">
        <PasswordInput id="del-password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={Boolean(fields.password)} aria-describedby="del-password-desc" />
      </Field>
      <Field id="del-confirm" label="Type DELETE to confirm" error={fields.confirm}>
        <Input id="del-confirm" autoComplete="off" value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-invalid={Boolean(fields.confirm)} aria-describedby="del-confirm-desc" />
      </Field>
      <div className="flex items-start gap-2.5 rounded-md border p-3">
        <Checkbox id="del-messages" checked={eraseMessages} onCheckedChange={(v) => setEraseMessages(v === true)} className="mt-0.5" />
        <Label htmlFor="del-messages" className="text-[13px] leading-snug font-normal">
          <span className="font-semibold">Also erase the text of messages I sent.</span> Left unticked, messages already delivered stay in other people&rsquo;s conversations, without your name. Ticked, they are blanked for everyone. Files you attached are erased either way.
        </Label>
      </div>
      <Field id="del-reason" label="Why are you leaving?" optional>
        <Textarea id="del-reason" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <SubmitButton pending={pending} pendingText="Scheduling…" variant="destructive">
        Delete my account in 14 days
      </SubmitButton>
    </form>
  );
}

export function CancelDeletionButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      disabled={pending}
      aria-busy={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await cancelAccountDeletionAction();
          if (res.ok) {
            toast.success(res.message);
            router.refresh();
          } else toast.error(res.error);
        })
      }
    >
      {pending ? "Cancelling…" : "Cancel the deletion"}
    </Button>
  );
}
