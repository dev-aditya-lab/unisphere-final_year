"use client";

import Link from "next/link";
import { BadgeCheck, ExternalLink, Info, Lightbulb, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/user-avatar";
import { CategoryBadge } from "@/components/posts/category-badge";
import { timeAgo } from "@/lib/format";

function ModeNote({ mode }) {
  const parts = [];
  parts.push(mode.semantic ? "Matched by meaning and keywords" : "Matched by keywords (semantic search is not enabled)");
  if (mode.aiExplanations || mode.aiAnalysis) parts.push("explanations written by AI");
  else if (mode.aiUnavailableReason && mode.aiUnavailableReason !== "opted_out") parts.push("AI explanations unavailable, showing simple reasons");
  return (
    <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
      <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <span>{parts.join(" · ")}. Ranked by relevance, recency and engagement.</span>
    </p>
  );
}

/** Related posts and people returned by idea discovery / originality check. */
export function RelatedResults({ result, onImprove, improving }) {
  const { related, people, mode } = result;

  return (
    <div className="space-y-4" aria-live="polite">
      <ModeNote mode={mode} />

      {related.length === 0 ? (
        <p className="bg-muted/50 rounded-md border border-dashed p-3 text-sm">
          Nothing similar has been shared on your campus yet. That could mean this is a fresh idea. Posting it may help others find you.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {related.map((r) => (
            <li key={r.id} className="rounded-lg border p-3">
              <div className="flex items-start justify-between gap-2">
                <Link prefetch={false} href={`${r.category === "ideas" ? "/ideas/" : "/posts/"}${r.slug}`} target="_blank" rel="noopener" className="font-heading flex items-center gap-1.5 text-sm font-bold hover:underline">
                  {r.title}
                  <ExternalLink className="text-muted-foreground size-3.5 shrink-0" aria-label="(opens in a new tab)" />
                </Link>
                <CategoryBadge category={r.category} />
              </div>
              <p className="text-muted-foreground mt-0.5 text-xs">
                by {r.author.name} · {timeAgo(r.createdAt)} · {r.reactions} reactions · {r.comments} comments
              </p>
              <p className="mt-2 text-sm">
                <span className={`flex items-center gap-1 text-xs font-bold ${r.source === "ai" ? "text-teal-text" : "text-muted-foreground"}`}>
                  {r.source === "ai" ? <Sparkles className="size-3" aria-hidden="true" /> : null}
                  {r.source === "ai" ? "Why it is related (AI)" : "Why it matched"}
                </span>
                {r.why}
              </p>
              {r.overlap?.length > 0 && (
                <p className="mt-1.5 text-xs">
                  <strong className="font-semibold">Overlap:</strong> {r.overlap.join(" · ")}
                </p>
              )}
              {r.differences && (
                <p className="mt-1 text-xs">
                  <strong className="font-semibold">Different:</strong> {r.differences}
                </p>
              )}
              {r.sharedConcepts?.length > 0 && (
                <p className="mt-2 flex flex-wrap gap-1">
                  {r.sharedConcepts.map((c) => (
                    <Badge key={c} variant="mono" className="normal-case tracking-normal">
                      {c}
                    </Badge>
                  ))}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {people?.length > 0 && (
        <div>
          <h4 className="eyebrow mb-2">People who list related skills</h4>
          <ul className="space-y-2">
            {people.map((p) => (
              <li key={p.id} className="flex items-start gap-2.5 rounded-lg border p-2.5">
                <UserAvatar name={p.full_name} avatarKey={p.avatar_key} size="sm" />
                <div className="min-w-0 text-sm">
                  <Link prefetch={false} href={`/u/${p.username}`} target="_blank" rel="noopener" className="flex items-center gap-1 font-semibold hover:underline">
                    {p.full_name}
                    {p.verified && <BadgeCheck className="text-teal-text size-3.5" aria-label="Verified" />}
                  </Link>
                  <p className="text-muted-foreground text-xs">{p.reason}</p>
                  {p.open_to_collaboration && <p className="text-success-text mt-0.5 text-xs font-medium">Open to collaborate</p>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {onImprove && (
        <button
          type="button"
          onClick={onImprove}
          disabled={improving}
          className="text-blue-text flex items-center gap-1.5 text-sm font-semibold hover:underline disabled:opacity-60"
        >
          <Lightbulb className="size-4" aria-hidden="true" />
          {improving ? "Thinking…" : "Suggest ways to improve or extend my idea"}
        </button>
      )}
    </div>
  );
}
