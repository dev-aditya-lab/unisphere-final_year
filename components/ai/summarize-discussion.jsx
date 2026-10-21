"use client";

import { useState, useTransition } from "react";
import { Loader2, X } from "lucide-react";
import { Sparkles } from "@/components/icons/lucide-compat";
import { Button } from "@/components/ui/button";
import { summarizeDiscussionAction } from "@/lib/actions/ai";

/** "Summarise this discussion" for threads with enough comments. Read-only; nothing is posted. */
export function SummarizeDiscussion({ postId }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  function run() {
    setError(null);
    startTransition(async () => {
      const res = await summarizeDiscussionAction({ postId });
      if (res.ok) setResult(res.data);
      else setError(res.error);
    });
  }

  return (
    <div className="mt-6">
      {!result && (
        <Button type="button" variant="outline" size="sm" onClick={run} disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Sparkles />}
          Summarise this discussion
        </Button>
      )}
      {error && (
        <p role="status" className="text-muted-foreground mt-2 text-sm">
          {error}
        </p>
      )}
      {result && (
        <section className="bg-teal/10 border-teal/40 rounded-xl border border-dashed p-4" aria-label="Discussion summary" aria-live="polite">
          <div className="mb-2 flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-xs font-semibold">
              <Sparkles className="text-teal-text size-3.5" aria-hidden="true" /> Summary <span className="text-muted-foreground font-normal">· AI-generated, may miss nuance</span>
            </p>
            <Button type="button" variant="ghost" size="icon-xs" onClick={() => setResult(null)} aria-label="Dismiss summary">
              <X />
            </Button>
          </div>
          <p className="text-sm">{result.summary}</p>
          {result.keyPoints.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-sm">
              {result.keyPoints.map((k) => (
                <li key={k}>{k}</li>
              ))}
            </ul>
          )}
          {result.openQuestions.length > 0 && (
            <div className="mt-2 text-sm">
              <p className="font-semibold">Still open</p>
              <ul className="text-muted-foreground list-disc pl-5">
                {result.openQuestions.map((k) => (
                  <li key={k}>{k}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
