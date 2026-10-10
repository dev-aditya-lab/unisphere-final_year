"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/forms/field";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { checkUsernameAction } from "@/lib/actions/lookup";
import { usernameSchema } from "@/lib/validators/auth";

/**
 * Username input with live availability feedback.
 * `register` comes from react-hook-form; `value` is the watched value.
 * `currentUsername` skips the check when the user keeps their existing name.
 */
export function UsernameField({ register, value, error, currentUsername, id = "username" }) {
  const debounced = useDebouncedValue((value || "").trim().toLowerCase(), 400);
  const [state, setState] = useState({ status: "idle", reason: null });

  useEffect(() => {
    let cancelled = false;
    if (!debounced || debounced === currentUsername) return;
    if (!usernameSchema.safeParse(debounced).success) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({ status: "checking", reason: null });
    checkUsernameAction(debounced).then((res) => {
      if (cancelled) return;
      if (res.available === true) setState({ status: "available", reason: null });
      else if (res.available === false) setState({ status: "taken", reason: res.reason });
      else setState({ status: "idle", reason: null });
    });
    return () => {
      cancelled = true;
    };
  }, [debounced, currentUsername]);

  const showTaken = state.status === "taken" && debounced && debounced !== currentUsername;

  return (
    <Field
      id={id}
      label="Username"
      error={error || (showTaken ? state.reason : undefined)}
      hint="Your profile lives at /u/username. Letters, numbers, hyphen or underscore."
    >
      <div className="relative">
        <span aria-hidden="true" className="text-muted-foreground pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm">
          @
        </span>
        <Input
          id={id}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          className="pr-9 pl-7"
          aria-invalid={Boolean(error || showTaken)}
          aria-describedby={`${id}-desc`}
          {...register("username", { setValueAs: (v) => (typeof v === "string" ? v.trim().toLowerCase() : v) })}
        />
        <span className="absolute inset-y-0 right-3 flex items-center" aria-live="polite">
          {state.status === "checking" && <Loader2 className="text-muted-foreground size-4 animate-spin" aria-label="Checking" />}
          {state.status === "available" && debounced !== currentUsername && <Check className="text-success-text size-4" aria-label="Available" />}
          {showTaken && <X className="text-destructive-text size-4" aria-label="Unavailable" />}
        </span>
      </div>
    </Field>
  );
}
