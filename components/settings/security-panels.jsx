"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/forms/field";
import { PasswordInput } from "@/components/forms/password-input";
import { SubmitButton } from "@/components/forms/submit-button";
import { FormAlert } from "@/components/forms/form-alert";
import { changePasswordSchema } from "@/lib/validators/auth";
import { changePasswordAction, signOutOtherSessionsAction } from "@/lib/actions/auth";

export function ChangePasswordCard() {
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState(null);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm({ resolver: zodResolver(changePasswordSchema), defaultValues: { currentPassword: "", password: "", confirmPassword: "" } });

  function onSubmit(values) {
    setServerError(null);
    startTransition(async () => {
      const res = await changePasswordAction(values);
      if (res.ok) {
        toast.success(res.message);
        reset();
      } else {
        setServerError(res.error);
        if (res.fieldErrors) for (const [f, m] of Object.entries(res.fieldErrors)) setError(f, { message: m });
      }
    });
  }

  return (
    <section className="surface p-5 sm:p-6">
      <h2 className="text-lg font-bold">Change password</h2>
      <p className="text-muted-foreground mt-0.5 text-sm">You will stay signed in here; other devices are signed out.</p>
      {serverError && <FormAlert className="mt-4">{serverError}</FormAlert>}
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-4 max-w-sm space-y-4">
        <Field id="currentPassword" label="Current password" error={errors.currentPassword?.message}>
          <PasswordInput id="currentPassword" autoComplete="current-password" aria-describedby="currentPassword-desc" {...register("currentPassword")} />
        </Field>
        <Field id="password" label="New password" error={errors.password?.message} hint="8+ characters with upper and lower case letters and a number.">
          <PasswordInput id="password" autoComplete="new-password" aria-describedby="password-desc" {...register("password")} />
        </Field>
        <Field id="confirmPassword" label="Confirm new password" error={errors.confirmPassword?.message}>
          <PasswordInput id="confirmPassword" autoComplete="new-password" aria-describedby="confirmPassword-desc" {...register("confirmPassword")} />
        </Field>
        <SubmitButton pending={pending} pendingText="Updating…">
          Update password
        </SubmitButton>
      </form>
    </section>
  );
}

export function SessionsCard() {
  const [pending, startTransition] = useTransition();
  return (
    <section className="surface p-5 sm:p-6">
      <h2 className="text-lg font-bold">Sessions</h2>
      <p className="text-muted-foreground mt-0.5 text-sm">Lost a device or used a shared computer? Sign out everywhere else.</p>
      <Button
        className="mt-4"
        variant="outline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await signOutOtherSessionsAction();
            if (res.ok) toast.success(res.message);
            else toast.error(res.error);
          })
        }
      >
        {pending ? "Signing out…" : "Sign out of other devices"}
      </Button>
    </section>
  );
}
