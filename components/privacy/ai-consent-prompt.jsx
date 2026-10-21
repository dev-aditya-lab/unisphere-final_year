"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sparkles } from "@/components/icons/lucide-compat";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { setConsentAction } from "@/lib/actions/privacy";

/**
 * Shown in place of the AI helpers until the member says yes. It explains exactly what is sent, asks once, and is not
 * pre-selected: nothing is sent to an AI provider unless the member presses the button.
 */
export function AiConsentPrompt() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(null);

  function allow() {
    setError(null);
    startTransition(async () => {
      const res = await setConsentAction({ purpose: "ai_assist", granted: true, source: "feature_prompt" });
      if (res.ok) {
        toast.success("AI features are on. You can turn them off in Settings → Privacy.");
        router.refresh();
      } else setError(res.error);
    });
  }

  return (
    <section aria-labelledby="ai-consent-title" className="bg-muted/40 rounded-md border p-3.5">
      <div className="flex items-start gap-3">
        <Sparkles className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <div className="min-w-0 text-[13px] leading-relaxed">
          <h3 id="ai-consent-title" className="font-semibold">
            Optional: writing help and related-work search
          </h3>
          <p className="text-muted-foreground mt-1">
            If you turn this on, the text you submit to an AI button is sent to an AI provider, which may be outside India, to get a result, with emails, phone numbers and ID numbers masked first. Private messages and private posts are never sent. You can turn it off any time, and UniSphere works fully without it.{" "}
            <Link href="/privacy-notice#ai" className="text-blue-text underline">
              What exactly is sent
            </Link>
          </p>
          {error && (
            <p role="alert" className="text-destructive-text mt-1 font-medium">
              {error}
            </p>
          )}
          <div className="mt-2.5 flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={allow} disabled={pending} aria-busy={pending}>
              {pending ? "Saving…" : "Allow AI features"}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
