"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { getBrowserClient } from "@/lib/supabase/client";

/** Google's four-colour "G". It is the provider's mark, shown as Google's branding rules ask. */
function GoogleG() {
  return (
    <svg viewBox="0 0 48 48" className="size-[18px]" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.2 7-17.6z" />
      <path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}

/**
 * "Continue with Google", through Supabase Auth (the free Google provider). The browser is sent to Google, then back to
 * /auth/callback with a one-time code that the server exchanges for the session (PKCE: the code is useless without the secret held
 * in this browser's cookie). `next` is checked again on the server before anyone is redirected there.
 */
export function GoogleButton({ next = "/feed", label = "Continue with Google" }) {
  const [state, setState] = useState({ busy: false, error: null });

  async function go() {
    setState({ busy: true, error: null });
    const { error } = await getBrowserClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`, queryParams: { prompt: "select_account" } },
    });
    // On success the browser is already on its way to Google; we only get here if it could not start.
    if (error) setState({ busy: false, error: "Google sign-in is not available right now. Please use your email instead." });
  }

  return (
    <div>
      <Button type="button" variant="outline" size="lg" className="w-full" onClick={go} disabled={state.busy}>
        <GoogleG />
        {state.busy ? "Opening Google…" : label}
      </Button>
      <p role="alert" className={state.error ? "text-destructive-text mt-2 text-sm" : "sr-only"}>{state.error}</p>
    </div>
  );
}

export function OrDivider() {
  return (
    <div className="text-muted-foreground my-5 flex items-center gap-3 text-xs" role="separator" aria-label="or">
      <span className="bg-border h-px flex-1" />
      or use your email
      <span className="bg-border h-px flex-1" />
    </div>
  );
}
