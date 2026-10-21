"use client";

import { AiConsentPrompt } from "@/components/privacy/ai-consent-prompt";
import { useState, useTransition } from "react";
import { Check, Loader2, X } from "lucide-react";
import { Search, ShieldCheck, Sparkles, Wand2 } from "@/components/icons/lucide-compat";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { RelatedResults } from "@/components/ai/related-results";
import { assistAction, discoverRelatedAction, ideaImprovementsAction, originalityCheckAction } from "@/lib/actions/ai";
import { CATEGORY_BY_VALUE } from "@/lib/content/post-meta";

const DISCOVERY_CATEGORIES = new Set(["ideas", "projects", "questions", "experiences"]);

function AssistButton({ icon: Icon = Wand2, busy, disabled, onClick, children }) {
  return (
    <Button type="button" variant="outline" size="sm" onClick={onClick} disabled={disabled} aria-busy={busy}>
      {busy ? <Loader2 className="animate-spin" /> : <Icon />}
      {children}
    </Button>
  );
}

function SuggestionShell({ title, onDismiss, children }) {
  return (
    <section className="bg-teal/10 border-teal/40 rounded-xl border border-dashed p-3.5" aria-label={title}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold">
          <Sparkles className="text-teal-text size-3.5" aria-hidden="true" />
          {title}
          <span className="text-muted-foreground font-normal">· AI suggestion, review before using</span>
        </p>
        <Button type="button" variant="ghost" size="icon-xs" onClick={onDismiss} aria-label="Dismiss suggestion">
          <X />
        </Button>
      </div>
      {children}
    </section>
  );
}

/**
 * Optional AI helpers inside the composer. Nothing here changes the draft until the member presses
 * "Use this"; the member always approves the final text. If AI is off or unavailable, the panel
 * explains why and the composer works exactly as before.
 */
export function AssistPanel({ ai, category, title, body, setTitle, setBody, setCategory }) {
  const [pendingTask, setPendingTask] = useState(null);
  const [, startTransition] = useTransition();
  const [suggestion, setSuggestion] = useState(null); // { kind, data }
  const [discovery, setDiscovery] = useState(null);
  const [improvements, setImprovements] = useState(null);
  const [message, setMessage] = useState(null);

  if (ai?.needsConsent) return <AiConsentPrompt />;
  if (!ai || (!ai.assist && !ai.discovery)) return null;

  const enough = body.trim().length >= 20;
  const canDiscover = ai.discovery && DISCOVERY_CATEGORIES.has(category);
  const ideaText = `${title ? title + ". " : ""}${body}`.trim();

  function run(task, fn) {
    setMessage(null);
    setPendingTask(task);
    startTransition(async () => {
      try {
        await fn();
      } finally {
        setPendingTask(null);
      }
    });
  }

  function assist(task) {
    run(task, async () => {
      const res = await assistAction({ task, category, title, body });
      if (res.ok) setSuggestion({ kind: task, data: res.data, meta: res.meta });
      else {
        setSuggestion(null);
        setMessage(res.error);
      }
    });
  }

  function find(kind) {
    run(kind, async () => {
      const action = kind === "originality" ? originalityCheckAction : discoverRelatedAction;
      const res = await action({ text: ideaText });
      if (res.ok) {
        setDiscovery({ kind, ...res });
        setImprovements(null);
      } else {
        setDiscovery(null);
        setMessage(res.error);
      }
    });
  }

  function improve() {
    run("improve", async () => {
      const res = await ideaImprovementsAction({ text: ideaText, related: (discovery?.related ?? []).map((r) => ({ title: r.title })) });
      if (res.ok) setImprovements(res.data);
      else setMessage(res.error);
    });
  }

  const busy = (t) => pendingTask === t;
  return (
    <div className="space-y-3" data-testid="ai-assist">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="AI assist">
        <span className="text-teal-text flex items-center gap-1.5 text-xs font-bold">
          <Sparkles className="size-3.5" aria-hidden="true" /> AI assist
        </span>
        {ai.assist && (
          <>
            <AssistButton busy={busy("improve_clarity")} disabled={Boolean(pendingTask) || !enough} onClick={() => assist("improve_clarity")}>
              Improve writing
            </AssistButton>
            <AssistButton busy={busy("generate_title")} disabled={Boolean(pendingTask) || !enough} onClick={() => assist("generate_title")}>
              Suggest title
            </AssistButton>
            <AssistButton busy={busy("suggest_tags")} disabled={Boolean(pendingTask) || !enough} onClick={() => assist("suggest_tags")}>
              Suggest tags
            </AssistButton>
            <AssistButton busy={busy("classify_post")} disabled={Boolean(pendingTask) || !enough} onClick={() => assist("classify_post")}>
              Suggest type
            </AssistButton>
            {category === "projects" && (
              <AssistButton busy={busy("structure_project")} disabled={Boolean(pendingTask) || !enough} onClick={() => assist("structure_project")}>
                Structure as project
              </AssistButton>
            )}
            {category === "questions" && (
              <AssistButton busy={busy("sharpen_question")} disabled={Boolean(pendingTask) || !enough} onClick={() => assist("sharpen_question")}>
                Sharpen question
              </AssistButton>
            )}
          </>
        )}
        {canDiscover && (
          <>
            <AssistButton icon={Search} busy={busy("discover")} disabled={Boolean(pendingTask) || !enough} onClick={() => find("discover")}>
              Find related work
            </AssistButton>
            <AssistButton icon={ShieldCheck} busy={busy("originality")} disabled={Boolean(pendingTask) || !enough} onClick={() => find("originality")}>
              Check originality
            </AssistButton>
          </>
        )}
      </div>
      {!enough && <p className="text-muted-foreground text-xs">Write a couple of sentences to unlock AI assist.</p>}
      {message && (
        <p role="status" className="text-muted-foreground bg-muted/60 rounded-md px-3 py-2 text-sm">
          {message}
        </p>
      )}

      {suggestion?.kind === "improve_clarity" && (
        <SuggestionShell title="Clearer version" onDismiss={() => setSuggestion(null)}>
          <p className="bg-card rounded-md border p-3 text-sm whitespace-pre-wrap">{suggestion.data.improved}</p>
          {suggestion.data.changes.length > 0 && (
            <ul className="text-muted-foreground mt-2 list-disc pl-5 text-xs">
              {suggestion.data.changes.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex gap-2">
            <Button type="button" size="sm" onClick={() => { setBody(suggestion.data.improved); setSuggestion(null); toast.success("Draft updated. You can still edit it."); }}>
              <Check /> Use this
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setSuggestion(null)}>
              Keep mine
            </Button>
          </div>
        </SuggestionShell>
      )}

      {suggestion?.kind === "generate_title" && (
        <SuggestionShell title="Title ideas" onDismiss={() => setSuggestion(null)}>
          <ul className="space-y-1.5">
            {suggestion.data.titles.map((t) => (
              <li key={t}>
                <button type="button" className="hover:bg-card hover:border-border w-full rounded-md border border-transparent px-3 py-2 text-left text-sm" onClick={() => { setTitle(t); setSuggestion(null); }}>
                  {t}
                </button>
              </li>
            ))}
          </ul>
        </SuggestionShell>
      )}

      {suggestion?.kind === "suggest_tags" && (
        <SuggestionShell title="Hashtag ideas" onDismiss={() => setSuggestion(null)}>
          <div className="flex flex-wrap gap-1.5">
            {suggestion.data.tags.map((t) => {
              const used = new RegExp(`#${t}\\b`, "i").test(body);
              return (
                <Button key={t} type="button" size="sm" variant={used ? "soft" : "outline"} disabled={used} onClick={() => setBody(`${body.trimEnd()} #${t}`)}>
                  #{t}
                </Button>
              );
            })}
          </div>
          <p className="text-muted-foreground mt-2 text-xs">Tap a tag to add it to your post.</p>
        </SuggestionShell>
      )}

      {suggestion?.kind === "classify_post" && (
        <SuggestionShell title="Suggested post type" onDismiss={() => setSuggestion(null)}>
          <p className="text-sm">
            <strong>{CATEGORY_BY_VALUE[suggestion.data.category]?.label}</strong> <span className="text-muted-foreground">({suggestion.data.confidence} confidence)</span>
          </p>
          <p className="text-muted-foreground mt-1 text-xs">{suggestion.data.reason}</p>
          <div className="mt-3 flex gap-2">
            <Button type="button" size="sm" disabled={suggestion.data.category === category} onClick={() => { setCategory(suggestion.data.category); setSuggestion(null); }}>
              <Check /> Use this type
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setSuggestion(null)}>
              Keep {CATEGORY_BY_VALUE[category]?.label}
            </Button>
          </div>
        </SuggestionShell>
      )}

      {suggestion?.kind === "structure_project" && (
        <SuggestionShell title="Structured project" onDismiss={() => setSuggestion(null)}>
          <dl className="bg-card space-y-2 rounded-md border p-3 text-sm">
            <div><dt className="font-semibold">Name</dt><dd>{suggestion.data.name}</dd></div>
            {suggestion.data.tagline && <div><dt className="font-semibold">Tagline</dt><dd>{suggestion.data.tagline}</dd></div>}
            <div><dt className="font-semibold">Problem</dt><dd>{suggestion.data.problem}</dd></div>
            {suggestion.data.goals.length > 0 && <div><dt className="font-semibold">Goals</dt><dd><ul className="list-disc pl-5">{suggestion.data.goals.map((g) => <li key={g}>{g}</li>)}</ul></dd></div>}
            {suggestion.data.solution && <div><dt className="font-semibold">Approach</dt><dd>{suggestion.data.solution}</dd></div>}
            {suggestion.data.techStack.length > 0 && <div><dt className="font-semibold">Tech</dt><dd>{suggestion.data.techStack.join(", ")}</dd></div>}
            {suggestion.data.openRoles.length > 0 && <div><dt className="font-semibold">Roles needed</dt><dd>{suggestion.data.openRoles.map((r) => `${r.title}${r.skills.length ? ` (${r.skills.join(", ")})` : ""}`).join("; ")}</dd></div>}
          </dl>
          <div className="mt-3 flex gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => {
                const d = suggestion.data;
                setTitle(d.name);
                setBody(
                  [
                    d.tagline,
                    `Problem: ${d.problem}`,
                    d.goals.length ? `Goals:\n${d.goals.map((g) => `- ${g}`).join("\n")}` : null,
                    d.solution ? `Approach: ${d.solution}` : null,
                    d.techStack.length ? `Tech: ${d.techStack.join(", ")}` : null,
                    d.openRoles.length ? `Looking for: ${d.openRoles.map((r) => r.title).join(", ")}` : null,
                  ].filter(Boolean).join("\n\n"),
                );
                setSuggestion(null);
                toast.success("Draft updated. Review and edit before posting.");
              }}
            >
              <Check /> Use this
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setSuggestion(null)}>Keep mine</Button>
          </div>
        </SuggestionShell>
      )}

      {suggestion?.kind === "sharpen_question" && (
        <SuggestionShell title="Sharper question" onDismiss={() => setSuggestion(null)}>
          <p className="bg-card rounded-md border p-3 text-sm whitespace-pre-wrap">{suggestion.data.question}</p>
          {suggestion.data.missingContext.length > 0 && (
            <div className="mt-2 text-xs">
              <p className="font-semibold">Details that would help people answer:</p>
              <ul className="text-muted-foreground list-disc pl-5">{suggestion.data.missingContext.map((m) => <li key={m}>{m}</li>)}</ul>
            </div>
          )}
          <div className="mt-3 flex gap-2">
            <Button type="button" size="sm" onClick={() => { setBody(suggestion.data.question); setSuggestion(null); }}><Check /> Use this</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setSuggestion(null)}>Keep mine</Button>
          </div>
        </SuggestionShell>
      )}

      {discovery && (
        <SuggestionShell title={discovery.kind === "originality" ? "Originality check" : "Related work on your campus"} onDismiss={() => { setDiscovery(null); setImprovements(null); }}>
          <RelatedResults result={discovery} onImprove={ai.assist || ai.discovery ? improve : undefined} improving={busy("improve")} />
          {discovery.kind === "originality" && (
            <div className="mt-3 space-y-2 text-sm">
              {discovery.distinctiveAngles?.length > 0 && (
                <div>
                  <p className="font-semibold">Ways to make it more distinctive</p>
                  <ul className="text-muted-foreground list-disc pl-5">{discovery.distinctiveAngles.map((a) => <li key={a}>{a}</li>)}</ul>
                </div>
              )}
              {discovery.suggestions?.length > 0 && (
                <ul className="text-muted-foreground list-disc pl-5">{discovery.suggestions.map((a) => <li key={a}>{a}</li>)}</ul>
              )}
              <p className="text-muted-foreground text-xs">{discovery.note}</p>
            </div>
          )}
          {improvements && (
            <div className="mt-4 space-y-3 border-t pt-3 text-sm">
              <p className="flex items-center gap-1.5 text-xs font-semibold"><Sparkles className="text-teal-text size-3.5" aria-hidden="true" /> Directions to consider</p>
              <ul className="space-y-2">
                {improvements.directions.map((d) => (
                  <li key={d.title}><strong>{d.title}.</strong> <span className="text-muted-foreground">{d.description}</span></li>
                ))}
              </ul>
              {improvements.risks.length > 0 && (
                <div><p className="font-semibold">Watch out for</p><ul className="text-muted-foreground list-disc pl-5">{improvements.risks.map((r) => <li key={r}>{r}</li>)}</ul></div>
              )}
              {improvements.firstSteps.length > 0 && (
                <div><p className="font-semibold">First steps</p><ul className="text-muted-foreground list-disc pl-5">{improvements.firstSteps.map((r) => <li key={r}>{r}</li>)}</ul></div>
              )}
            </div>
          )}
        </SuggestionShell>
      )}
    </div>
  );
}
