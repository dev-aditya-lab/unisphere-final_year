"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { MailCheck } from "@/components/icons/lucide-compat";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/forms/field";
import { SubmitButton } from "@/components/forms/submit-button";
import { FormAlert } from "@/components/forms/form-alert";
import { forgotPasswordSchema } from "@/lib/validators/auth";
import { forgotPasswordAction } from "@/lib/actions/auth";

export function ForgotPasswordForm({ expired }) {
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState(null);
  const [sent, setSent] = useState(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({ resolver: zodResolver(forgotPasswordSchema), defaultValues: { email: "" } });

  function onSubmit(values) {
    setServerError(null);
    startTransition(async () => {
      const result = await forgotPasswordAction(values);
      if (result.ok) setSent(values.email);
      else setServerError(result.error);
    });
  }

  if (sent) {
    return (
      <div className="text-center">
        <span className="bg-accent text-accent-foreground mx-auto flex size-12 items-center justify-center rounded-full">
          <MailCheck className="size-6" aria-hidden="true" />
        </span>
        <h1 className="mt-5 text-2xl font-extrabold">Check your inbox</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          If an account exists for <strong className="text-foreground">{sent}</strong>, we have sent a link to reset your password. It expires soon and works once.
        </p>
        <Link href="/login" className="text-blue-text mt-6 inline-block text-sm font-semibold hover:underline">
          Back to log in
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-3xl font-extrabold">Forgot your password?</h1>
      <p className="text-muted-foreground mt-2 text-sm">Enter your email and we will send you a link to choose a new one.</p>
      {expired && <FormAlert variant="warning" className="mt-6">That reset link expired or was already used. Request a new one below.</FormAlert>}
      {serverError && <FormAlert className="mt-6">{serverError}</FormAlert>}
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-6 space-y-4">
        <Field id="email" label="Email" error={errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" inputMode="email" aria-invalid={Boolean(errors.email)} aria-describedby="email-desc" {...register("email")} />
        </Field>
        <SubmitButton pending={pending} pendingText="Sending…" className="w-full" size="lg">
          Send reset link
        </SubmitButton>
      </form>
      <p className="text-muted-foreground mt-6 text-center text-sm">
        Remembered it?{" "}
        <Link href="/login" className="text-blue-text font-semibold hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
