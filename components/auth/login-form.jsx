"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/forms/field";
import { PasswordInput } from "@/components/forms/password-input";
import { SubmitButton } from "@/components/forms/submit-button";
import { FormAlert } from "@/components/forms/form-alert";
import { Button } from "@/components/ui/button";
import { loginSchema } from "@/lib/validators/auth";
import { loginAction, resendVerificationAction } from "@/lib/actions/auth";
import { GoogleButton, OrDivider } from "@/components/auth/google-button";

export function LoginForm({ next, flash, google = false }) {
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState(null);
  const [needsConfirm, setNeedsConfirm] = useState(false);

  const {
    register,
    handleSubmit,
    getValues,
    setError,
    formState: { errors },
  } = useForm({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "", next } });

  function onSubmit(values) {
    setServerError(null);
    setNeedsConfirm(false);
    startTransition(async () => {
      const result = await loginAction(values);
      // On success the action redirects; we only get here on failure.
      if (result && !result.ok) {
        setServerError(result.error);
        setNeedsConfirm(result.code === "email_not_confirmed");
        if (result.fieldErrors) {
          for (const [field, message] of Object.entries(result.fieldErrors)) setError(field, { message });
        }
      }
    });
  }

  async function resend() {
    const res = await resendVerificationAction({ email: getValues("email") });
    if (res.ok) toast.success(res.message);
    else toast.error(res.error);
  }

  return (
    <div>
      <h1 className="text-3xl font-extrabold">Welcome back</h1>
      <p className="text-muted-foreground mt-2 text-sm">Log in to see what your campus is building.</p>

      <div className="mt-6 space-y-3">
        {flash === "reset" && <FormAlert variant="success">Password updated. Log in with your new password.</FormAlert>}
        {flash === "expired_link" && <FormAlert variant="warning">That link has expired or was already used. Request a new one.</FormAlert>}
        {flash === "invalid_link" && <FormAlert variant="warning">That link is not valid.</FormAlert>}
        {flash === "google_failed" && <FormAlert variant="warning">Google sign-in did not finish. Please try again, or use your email.</FormAlert>}
        {flash === "registration_closed" && <FormAlert variant="info">New accounts are not being accepted right now. If you already have an account, sign in with your email.</FormAlert>}
        {flash === "profile_missing" && <FormAlert variant="error">Your profile could not be loaded. Please log in again.</FormAlert>}
        {serverError && (
          <FormAlert variant="error">
            {serverError}
            {needsConfirm && (
              <Button type="button" variant="link" size="sm" className="ml-1 h-auto p-0 align-baseline" onClick={resend}>
                Resend link
              </Button>
            )}
          </FormAlert>
        )}
      </div>

      {google && (
        <div className="mt-5">
          <GoogleButton next={next} />
          <OrDivider />
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className={google ? "space-y-4" : "mt-5 space-y-4"}>
        <input type="hidden" {...register("next")} />
        <Field id="email" label="Email" error={errors.email?.message}>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            aria-invalid={Boolean(errors.email)}
            aria-describedby="email-desc"
            {...register("email")}
          />
        </Field>
        <Field
          id="password"
          label="Password"
          error={errors.password?.message}
          labelAction={
            <Link href="/forgot-password" className="text-blue-text text-xs font-medium hover:underline">
              Forgot password?
            </Link>
          }
        >
          <PasswordInput
            id="password"
            autoComplete="current-password"
            aria-invalid={Boolean(errors.password)}
            aria-describedby="password-desc"
            {...register("password")}
          />
        </Field>
        <SubmitButton pending={pending} pendingText="Logging in…" className="w-full" size="lg">
          Log in
        </SubmitButton>
      </form>

      <p className="text-muted-foreground mt-6 text-center text-sm">
        New to UniSphere?{" "}
        <Link href="/register" className="text-blue-text font-semibold hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
