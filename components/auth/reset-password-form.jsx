"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Field } from "@/components/forms/field";
import { PasswordInput } from "@/components/forms/password-input";
import { SubmitButton } from "@/components/forms/submit-button";
import { FormAlert } from "@/components/forms/form-alert";
import { resetPasswordSchema } from "@/lib/validators/auth";
import { resetPasswordAction } from "@/lib/actions/auth";

export function ResetPasswordForm() {
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({ resolver: zodResolver(resetPasswordSchema), defaultValues: { password: "", confirmPassword: "" } });

  function onSubmit(values) {
    setServerError(null);
    startTransition(async () => {
      const result = await resetPasswordAction(values);
      if (result && !result.ok) setServerError(result.error);
    });
  }

  return (
    <div>
      <h1 className="text-3xl font-extrabold">Choose a new password</h1>
      <p className="text-muted-foreground mt-2 text-sm">You will be signed out everywhere and asked to log in again.</p>
      {serverError && <FormAlert className="mt-6">{serverError}</FormAlert>}
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-6 space-y-4">
        <Field id="password" label="New password" error={errors.password?.message} hint="8+ characters with upper and lower case letters and a number.">
          <PasswordInput id="password" autoComplete="new-password" aria-invalid={Boolean(errors.password)} aria-describedby="password-desc" {...register("password")} />
        </Field>
        <Field id="confirmPassword" label="Confirm new password" error={errors.confirmPassword?.message}>
          <PasswordInput id="confirmPassword" autoComplete="new-password" aria-invalid={Boolean(errors.confirmPassword)} aria-describedby="confirmPassword-desc" {...register("confirmPassword")} />
        </Field>
        <SubmitButton pending={pending} pendingText="Updating…" className="w-full" size="lg">
          Update password
        </SubmitButton>
      </form>
    </div>
  );
}
