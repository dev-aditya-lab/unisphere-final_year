"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, RotateCcw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { submitQuizAction } from "@/lib/actions/academy";

/** A quiz. Answers go to the server, which grades them against a key students cannot read and answers only with the score. */
export function QuizForm({ lessonId, questions, passPct, last }) {
  const router = useRouter();
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [pending, start] = useTransition();
  const answered = questions.every((q) => (answers[q.id] ?? []).length > 0);

  function toggle(q, i) {
    setAnswers((a) => {
      const cur = a[q.id] ?? [];
      return { ...a, [q.id]: q.multiple ? (cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i]) : [i] };
    });
  }

  function submit(e) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await submitQuizAction({ lessonId, answers });
      if (res.ok) {
        setResult(res.result);
        router.refresh();
      } else setError(res.error);
    });
  }

  if (questions.length === 0) return <p className="text-muted-foreground text-sm">This quiz has no questions yet.</p>;

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      <p className="text-muted-foreground text-sm">Pass mark: {passPct}%. {last && !result && <>Your last attempt: <strong className={last.passed ? "text-[var(--success-text)]" : ""}>{last.score_pct}%</strong>{last.passed ? " (passed)" : ""}.</>}</p>
      {result ? (
        <div role="status" className={`flex items-start gap-3 rounded-xl p-4 ${result.passed ? "bg-success-soft text-[var(--success-text)]" : "bg-warning-soft text-warning-text"}`}>
          {result.passed ? <CheckCircle2 className="mt-0.5 size-5 shrink-0" aria-hidden /> : <XCircle className="mt-0.5 size-5 shrink-0" aria-hidden />}
          <div>
            <p className="font-bold">{result.passed ? "Passed" : "Not passed yet"}: {result.score_pct}%</p>
            <p className="text-sm">{result.correct} of {result.total} correct. {result.passed ? "This lesson is complete." : `You need ${result.pass_pct}%. You can try again.`}</p>
            {!result.passed && <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => { setResult(null); setAnswers({}); }}><RotateCcw aria-hidden />Try again</Button>}
          </div>
        </div>
      ) : (
        <>
          {questions.map((q, n) => (
            <fieldset key={q.id} className="space-y-2">
              <legend className="text-[15px] font-semibold"><span className="text-muted-foreground mr-2 font-mono text-xs">{n + 1}</span>{q.prompt}</legend>
              <p className="text-muted-foreground text-xs">{q.multiple ? "Choose all that apply." : "Choose one."}</p>
              <div className="space-y-2">
                {q.options.map((opt, i) => {
                  const on = (answers[q.id] ?? []).includes(i);
                  return (
                    <label key={i} className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors ${on ? "border-[var(--ac-violet)] bg-primary-soft" : "hover:bg-accent"}`}>
                      <input type={q.multiple ? "checkbox" : "radio"} name={q.id} checked={on} onChange={() => toggle(q, i)} className="accent-[var(--ac-violet)] size-4" />
                      <span>{opt}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}
          <p role="alert" className={error ? "bg-destructive-soft text-destructive-text rounded-lg px-3 py-2 text-sm font-medium" : "sr-only"}>{error}</p>
          <Button type="submit" disabled={!answered || pending}>{pending ? "Checking…" : "Check my answers"}</Button>
        </>
      )}
    </form>
  );
}
