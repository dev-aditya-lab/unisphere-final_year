"use client";

import { useOptimistic, useTransition } from "react";
import { ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { toggleVoteAction } from "@/lib/actions/feedback";
import { cn } from "@/lib/utils";

/** Upvote button for one idea. Updates instantly and rolls back if the server refuses. */
export function IdeaVote({ id, voted, count, disabled }) {
  const [state, setOptimistic] = useOptimistic({ voted, count }, (s, next) => ({ voted: next, count: s.count + (next ? 1 : -1) }));
  const [, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={state.voted}
      aria-label={`${state.voted ? "Remove your vote from" : "Vote for"} this idea. ${state.count} vote${state.count === 1 ? "" : "s"}`}
      onClick={() =>
        startTransition(async () => {
          setOptimistic(!state.voted);
          const res = await toggleVoteAction({ id });
          if (!res.ok) toast.error(res.error);
        })
      }
      className={cn(
        "flex w-14 shrink-0 flex-col items-center justify-center rounded-md border py-2 text-sm font-bold transition-colors disabled:opacity-60",
        state.voted ? "border-primary bg-accent text-accent-foreground" : "hover:bg-muted",
      )}
    >
      <ChevronUp className="size-4" aria-hidden="true" />
      <span className="tabular-nums">{state.count}</span>
    </button>
  );
}
