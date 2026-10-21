"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/forms/submit-button";
import { FormAlert } from "@/components/forms/form-alert";
import { completePrivacyReviewAction } from "@/lib/actions/privacy";
import { logoutAction } from "@/lib/actions/auth";

/**
 * The privacy review: for accounts that have no recorded consent yet (made before the consent flow, or created without
 * the signup form), and for people who say they are under 18. Nothing is pre-selected. Leaving is always possible:
 * sign out, or delete the account.
 */
export function ReviewForm({ next, needsAge, needsCore, minor, noticeVersion }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [age, setAge] = useState(minor ? "under_18" : "");
  const [core, setCore] = useState(false);
  const [error, setError] = useState(null);
  const [fieldError, setFieldError] = useState(null);
  const [declaredMinor, setDeclaredMinor] = useState(minor);

  function submit(e) {
    e.preventDefault();
    setError(null);
    setFieldError(null);
    if (!age) return setFieldError("Choose one");
    startTransition(async () => {
      const res = await completePrivacyReviewAction({ age, acceptCore: core, next });
      if (res.ok && res.minor) return setDeclaredMinor(true);
      if (res.ok) return router.push(res.next);
      setError(res.error);
      if (res.fieldErrors?.acceptCore) setFieldError(res.fieldErrors.acceptCore);
    });
  }

  if (declaredMinor) {
    return (
      <div className="space-y-4" role="status">
        <FormAlert variant="info" title="UniSphere is for people aged 18 and over">
          Thank you for telling us. UniSphere cannot keep an account for someone under 18, because it has no way to get a parent&rsquo;s verified consent. Nothing else about your account has been changed.
        </FormAlert>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/delete-account">Delete my account and data</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/privacy-requests">Download my data</Link>
          </Button>
          <form action={logoutAction}>
            <Button type="submit" variant="outline">Log out</Button>
          </form>
        </div>
        <p className="text-muted-foreground text-xs">
          If you answered by mistake, <Link href="/contact?topic=privacy" className="text-blue-text underline">tell the privacy team</Link>.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      {error && <FormAlert>{error}</FormAlert>}

      {needsAge && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold">Your age</legend>
          <p className="text-muted-foreground text-[13px]">UniSphere is for adults. This is a statement from you; no date of birth or document is collected.</p>
          <RadioGroup value={age} onValueChange={setAge} aria-label="Your age" className="mt-2 gap-2">
            {[
              ["adult", "I am 18 years old or older"],
              ["under_18", "I am under 18"],
            ].map(([value, label]) => (
              <Label key={value} htmlFor={`age-${value}`} className="border-input hover:border-primary/50 flex cursor-pointer items-center gap-3 rounded-md border p-3 text-sm font-medium">
                <RadioGroupItem id={`age-${value}`} value={value} />
                {label}
              </Label>
            ))}
          </RadioGroup>
          {fieldError && !age && (
            <p role="alert" className="text-destructive-text text-xs font-medium">{fieldError}</p>
          )}
        </fieldset>
      )}

      {needsCore && age !== "under_18" && (
        <div className="space-y-1.5">
          <div className="flex items-start gap-2.5">
            <Checkbox id="acceptCore" checked={core} onCheckedChange={(v) => setCore(v === true)} aria-invalid={Boolean(fieldError && age)} className="mt-0.5" />
            <Label htmlFor="acceptCore" className="text-[13px] leading-snug font-normal">
              I agree to UniSphere using the account details and content I give it to run my account and the features I use, as explained in the{" "}
              <Link href="/privacy-notice" target="_blank" className="text-blue-text font-medium hover:underline">privacy notice</Link> (version {noticeVersion}). I can withdraw this by deleting my account.
            </Label>
          </div>
          {fieldError && age && (
            <p role="alert" className="text-destructive-text text-xs font-medium">{fieldError}</p>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pending={pending} pendingText="Saving…">
          {age === "under_18" ? "Continue" : "Save and continue"}
        </SubmitButton>
        <Link href="/delete-account" className="text-muted-foreground hover:text-foreground text-sm underline">
          I would rather delete my account
        </Link>
      </div>
    </form>
  );
}
