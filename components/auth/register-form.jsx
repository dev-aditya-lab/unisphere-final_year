"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Field } from "@/components/forms/field";
import { PasswordInput } from "@/components/forms/password-input";
import { SubmitButton } from "@/components/forms/submit-button";
import { FormAlert } from "@/components/forms/form-alert";
import { UsernameField } from "@/components/forms/username-field";
import { registerSchema } from "@/lib/validators/auth";
import { registerAction } from "@/lib/actions/auth";
import { cn } from "@/lib/utils";

function ConsentCheck({ name, control, label, error }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-start gap-2.5">
        <Controller
          control={control}
          name={name}
          render={({ field }) => (
            <Checkbox
              id={name}
              checked={field.value}
              onCheckedChange={(v) => field.onChange(v === true)}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? `${name}-desc` : undefined}
              className="mt-0.5"
            />
          )}
        />
        <Label htmlFor={name} className="text-muted-foreground block text-[13px] leading-snug font-normal">
          {label}
        </Label>
      </div>
      {error && (
        <p id={`${name}-desc`} role="alert" className="text-destructive-text text-xs font-medium">
          {error}
        </p>
      )}
    </div>
  );
}

export function RegisterForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState(null);

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(registerSchema),
    defaultValues: { fullName: "", username: "", email: "", password: "", acceptTerms: false, acceptPrivacy: false, confirmAdult: false },
  });

  const username = useWatch({ control, name: "username" });
  const password = useWatch({ control, name: "password" }) || "";

  function onSubmit(values) {
    setServerError(null);
    startTransition(async () => {
      const result = await registerAction(values);
      if (result.ok) {
        router.push(`/verify-email?email=${encodeURIComponent(result.email)}`);
        return;
      }
      setServerError(result.error);
      if (result.fieldErrors) {
        for (const [field, message] of Object.entries(result.fieldErrors)) setError(field, { message });
      }
    });
  }

  const rules = [
    { ok: password.length >= 8, text: "8+ characters" },
    { ok: /[a-z]/.test(password) && /[A-Z]/.test(password), text: "Upper & lower case" },
    { ok: /[0-9]/.test(password), text: "A number" },
  ];

  return (
    <div>
      <h1 className="text-3xl font-extrabold">Create your account</h1>
      <p className="text-muted-foreground mt-2 text-sm">UniSphere is free and open to everyone. You do not need a college.</p>

      {serverError && <FormAlert className="mt-6">{serverError}</FormAlert>}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-6 space-y-4">
        <Field id="fullName" label="Full name" error={errors.fullName?.message}>
          <Input id="fullName" autoComplete="name" aria-invalid={Boolean(errors.fullName)} aria-describedby="fullName-desc" {...register("fullName")} />
        </Field>

        <UsernameField register={register} value={username} error={errors.username?.message} />

        <Field id="email" label="Email" error={errors.email?.message} hint="Use an address you check: we send one link to confirm it.">
          <Input id="email" type="email" autoComplete="email" inputMode="email" aria-invalid={Boolean(errors.email)} aria-describedby="email-desc" {...register("email")} />
        </Field>

        <Field id="password" label="Password" error={errors.password?.message}>
          <PasswordInput id="password" autoComplete="new-password" aria-invalid={Boolean(errors.password)} aria-describedby="password-rules" {...register("password")} />
          <ul id="password-rules" className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {rules.map((r) => (
              <li key={r.text} className={cn("flex items-center gap-1.5", r.ok ? "text-success-text" : "text-muted-foreground")}>
                <span aria-hidden="true" className={cn("size-1.5 rounded-full", r.ok ? "bg-success" : "bg-muted-foreground/50")} />
                {r.text}
                <span className="sr-only">{r.ok ? "(met)" : "(not met)"}</span>
              </li>
            ))}
          </ul>
        </Field>

        <fieldset className="space-y-3">
          <legend className="text-[13px] font-semibold">Before you create your account</legend>
          <p className="text-muted-foreground text-xs leading-relaxed">
            Three separate statements, none ticked for you. Optional things, like AI features, are never part of signing up: you can choose them later in Settings.
          </p>
          <ConsentCheck
            name="confirmAdult"
            control={control}
            error={errors.confirmAdult?.message}
            label={<>I am 18 years old or older. UniSphere is for adults and does not ask for a date of birth or an ID to check this.</>}
          />
          <ConsentCheck
            name="acceptPrivacy"
            control={control}
            error={errors.acceptPrivacy?.message}
            label={
              <>
                I agree to UniSphere using the account details and content I give it to run my account and the features I use, as explained in the{" "}
                <Link href="/privacy-notice" target="_blank" className="text-blue-text font-medium hover:underline">privacy notice</Link>. I can withdraw this by deleting my account.
              </>
            }
          />
          <ConsentCheck
            name="acceptTerms"
            control={control}
            error={errors.acceptTerms?.message}
            label={
              <>
                I accept the <Link href="/terms" target="_blank" className="text-blue-text font-medium hover:underline">Terms of Service</Link> and the{" "}
                <Link href="/guidelines" target="_blank" className="text-blue-text font-medium hover:underline">Community Guidelines</Link>. This is separate from the privacy choice above.
              </>
            }
          />
          <p className="text-muted-foreground text-xs">
            Read the full{" "}
            <Link href="/privacy" target="_blank" className="text-blue-text font-medium hover:underline">Privacy Policy</Link> and your{" "}
            <Link href="/privacy-centre" target="_blank" className="text-blue-text font-medium hover:underline">privacy rights</Link>.
          </p>
        </fieldset>

        <SubmitButton pending={pending} pendingText="Creating account…" className="w-full" size="lg">
          Create account
        </SubmitButton>
      </form>

      <p className="text-muted-foreground mt-6 text-center text-sm">
        Already have an account?{" "}
        <Link href="/login" className="text-blue-text font-semibold hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
