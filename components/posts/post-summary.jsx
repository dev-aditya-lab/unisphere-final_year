"use client";

import { useState, useTransition } from "react";
import { Loader2, RotateCw, X } from "lucide-react";
import { Sparkles } from "@/components/icons/lucide-compat";
import { Button } from "@/components/ui/button";
import { summarizePostAction } from "@/lib/actions/ai";

/**
 * "Summarize" for a long post. Nothing runs until the member presses the button; the answer is labelled as AI-written
 * and kept apart from the post. If the AI service is unavailable the post is unaffected and the member can retry.
 */
export function PostSummary({ post }) {
  const [state, setState] = useState({ status: "idle" }); // idle | done | error
  const [pending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      let res;
      try {
        res = await summarizePostAction({ postId: post.id });
      } catch {
        res = { ok: false, error: "We could not reach UniSphere. Try again." };
      }
      setState(res.ok ? { status: "done", data: res.data } : { status: "error", message: res.error ?? "Could not summarise this post." });
    });
  }

  if (state.status === "done") {
    return (
      <section className="bg-primary-soft/60 border-primary/15 mt-3 rounded-xl border p-3.5" aria-label="AI summary">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <p className="text-primary-text flex items-center gap-1.5 text-xs font-semibold">
            <Sparkles className="size-3.5" aria-hidden="true" />
            AI summary
            <span className="text-muted-foreground font-normal">· may contain mistakes, the post is the source</span>
          </p>
          <Button type="button" variant="ghost" size="icon-xs" onClick={() => setState({ status: "idle" })} aria-label="Hide summary">
            <X />
          </Button>
        </div>
        <p className="text-sm leading-relaxed">{state.data.summary}</p>
        {state.data.keyPoints.length > 0 && (
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {state.data.keyPoints.map((k, i) => (
              <li key={i}>{k}</li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <Button type="button" variant="soft" size="sm" onClick={run} disabled={pending} aria-busy={pending}>
        {pending ? <Loader2 className="animate-spin" /> : state.status === "error" ? <RotateCw /> : <Sparkles />}
        {pending ? "Summarising…" : state.status === "error" ? "Try again" : "Summarize with AI"}
      </Button>
      {state.status === "error" && (
        <p role="alert" className="text-muted-foreground text-xs">
          {state.message}
        </p>
      )}
    </div>
  );
}
