"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bug } from "lucide-react";
import { Lightbulb, MessageSquareHeart } from "@/components/icons/lucide-compat";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitFeedbackAction } from "@/lib/actions/feedback";
import { BUG_SEVERITIES, FEEDBACK_AREAS, FEEDBACK_KINDS } from "@/lib/feedback-meta";
import { cn } from "@/lib/utils";

const ICONS = { bug: Bug, feature: Lightbulb, feedback: MessageSquareHeart };
const field = "border-input bg-card focus-visible:border-ring focus-visible:ring-ring/40 h-9 w-full rounded-md border px-2.5 text-sm outline-none focus-visible:ring-[3px]";

/** One form for bugs, feature ideas and general feedback. The page, app version and browser are attached automatically. */
export function FeedbackForm({ initialKind = "feature", fromPath = null }) {
  const [kind, setKind] = useState(initialKind);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [area, setArea] = useState("other");
  const [severity, setSeverity] = useState("medium");
  const [errors, setErrors] = useState({});
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const current = FEEDBACK_KINDS.find((k) => k.value === kind);

  function submit(e) {
    e.preventDefault();
    setErrors({});
    startTransition(async () => {
      const res = await submitFeedbackAction({
        kind, title, body, area, ...(kind === "bug" ? { severity } : {}),
        context: { path: fromPath ?? undefined, standalone: window.matchMedia("(display-mode: standalone)").matches, viewport: `${window.innerWidth}x${window.innerHeight}` },
      });
      if (res.ok) {
        toast.success(res.message);
        setTitle("");
        setBody("");
        router.refresh();
      } else setErrors({ ...res.fieldErrors, _form: res.error });
    });
  }

  return (
    <form onSubmit={submit} className="surface space-y-4 p-4 sm:p-5" aria-labelledby="feedback-form-title">
      <h2 id="feedback-form-title" className="font-heading text-lg font-bold">Tell the team</h2>
      <fieldset>
        <legend className="sr-only">What kind of message is this?</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {FEEDBACK_KINDS.map((k) => {
            const Icon = ICONS[k.value];
            return (
              <label key={k.value} className={cn("hover:bg-muted/60 flex cursor-pointer items-center gap-2 rounded-md border p-2.5 text-sm font-medium has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/40", kind === k.value && "border-primary bg-accent/50")}>
                <input type="radio" name="kind" value={k.value} checked={kind === k.value} onChange={() => setKind(k.value)} className="sr-only" />
                <Icon className="text-coral-text size-4 shrink-0" aria-hidden="true" /> {k.label}
              </label>
            );
          })}
        </div>
        <p className="text-muted-foreground mt-2 text-[13px]">{current.hint}</p>
      </fieldset>

      <div className="space-y-1.5">
        <Label htmlFor="fb-title" className="text-[13px] font-semibold">{kind === "bug" ? "What went wrong?" : kind === "feature" ? "Your idea in one line" : "Summary"}</Label>
        <input id="fb-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} className={field} required aria-invalid={Boolean(errors.title) || undefined} />
        {errors.title && <p className="text-destructive-text text-xs">{errors.title}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="fb-body" className="text-[13px] font-semibold">
          {kind === "bug" ? "What did you do, what did you expect, and what happened instead?" : kind === "feature" ? "Why would it help?" : "Details"}
        </Label>
        <Textarea id="fb-body" value={body} onChange={(e) => setBody(e.target.value)} rows={5} maxLength={4000} required aria-invalid={Boolean(errors.body) || undefined} />
        {errors.body && <p className="text-destructive-text text-xs">{errors.body}</p>}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="fb-area" className="text-[13px] font-semibold">Where?</Label>
          <select id="fb-area" value={area} onChange={(e) => setArea(e.target.value)} className={field}>
            {FEEDBACK_AREAS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
        </div>
        {kind === "bug" && (
          <div className="space-y-1.5">
            <Label htmlFor="fb-severity" className="text-[13px] font-semibold">How bad is it?</Label>
            <select id="fb-severity" value={severity} onChange={(e) => setSeverity(e.target.value)} className={field}>
              {BUG_SEVERITIES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        )}
      </div>
      {kind === "bug" && (
        <p className="text-muted-foreground text-xs">
          To help us reproduce it we attach the page you were on{fromPath ? ` (${fromPath})` : ""}, the app version, your browser and your screen size. Never include passwords or private messages here.
        </p>
      )}
      {errors._form && <p role="alert" className="text-destructive-text text-sm">{errors._form}</p>}
      <Button type="submit" disabled={pending || title.trim().length < 5 || body.trim().length < 10}>{pending ? "Sending…" : "Send"}</Button>
    </form>
  );
}
