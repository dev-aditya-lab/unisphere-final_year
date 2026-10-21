"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AppIcon } from "@/components/icons/app-icon";
import { contentImpactAction, purgeContentAction, purgeUserAction, userImpactAction } from "@/lib/actions/admin";
import { cn } from "@/lib/utils";

const NOUN = { post: "post", community: "community", event: "event", user: "account" };

// What each count in the database's impact report means, in words. Only counts above zero are shown.
const COUNT_TEXT = {
  posts: (n) => `${n} post${n === 1 ? "" : "s"}`,
  comments: (n) => `${n} comment${n === 1 ? "" : "s"} and ${n === 1 ? "reply" : "replies"}`,
  reactions: (n) => `${n} like${n === 1 ? "" : "s"} and reaction${n === 1 ? "" : "s"}`,
  comment_likes: (n) => `${n} like${n === 1 ? "" : "s"} on comments`,
  bookmarks: (n) => `${n} bookmark${n === 1 ? "" : "s"}`,
  attachments: (n) => `${n} image${n === 1 ? "" : "s"}`,
  members: (n) => `${n} member${n === 1 ? "" : "s"} of the community`,
  events: (n) => `${n} community-only event${n === 1 ? "" : "s"}`,
  responses: (n) => `${n} registration${n === 1 ? "" : "s"}`,
  projects: (n) => `${n} project${n === 1 ? "" : "s"}`,
  connections: (n) => `${n} connection${n === 1 ? "" : "s"}`,
  files: (n) => `${n} uploaded file${n === 1 ? "" : "s"}`,
};

const STEPS = ["Review", "Reason", "Confirm"];

function Progress({ step }) {
  return (
    <ol aria-label="Steps" className="flex items-center gap-2 text-xs font-semibold">
      {STEPS.map((label, i) => (
        <li key={label} aria-current={i === step ? "step" : undefined} className={cn("flex items-center gap-2", i === step ? "text-destructive-text" : "text-muted-foreground")}>
          <span className={cn("grid size-5 place-items-center rounded-full border text-[11px]", i < step && "bg-destructive-text border-transparent text-background", i === step && "border-destructive-text")}>{i + 1}</span>
          {label}
          {i < STEPS.length - 1 && <span aria-hidden="true" className="bg-border h-px w-4" />}
        </li>
      ))}
    </ol>
  );
}

/**
 * Permanent deletion for global administrators, in three deliberate steps:
 *   1 Review   what exactly will be deleted with it (counts read from the database just now)
 *   2 Reason   a written reason (kept in the audit log) and an acknowledgement that it cannot be undone
 *   3 Confirm  the item's address typed back exactly, and the administrator's own password
 * Nothing is deleted before step 3's button, and the server re-checks the permission, the reason, the typed address and the
 * password again, so skipping the dialog (a forged request) gets nowhere. `kind` is post, community, event or user.
 */
export function PermanentDelete({ kind, id, name, label = "Delete permanently", size = "sm", className }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [impact, setImpact] = useState(null);
  const [reason, setReason] = useState("");
  const [understood, setUnderstood] = useState(false);
  const [eraseMessages, setEraseMessages] = useState(false);
  const [typed, setTyped] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [fieldError, setFieldError] = useState(null);
  const [loading, startLoad] = useTransition();
  const [pending, startDelete] = useTransition();
  const router = useRouter();
  const noun = NOUN[kind];

  function reset() {
    setStep(0); setImpact(null); setReason(""); setUnderstood(false); setEraseMessages(false); setTyped(""); setPassword(""); setError(null); setFieldError(null);
  }

  function onOpenChange(next) {
    if (pending) return;
    setOpen(next);
    if (next) {
      // Step 1 reads what the deletion would take, straight from the database.
      startLoad(async () => {
        const res = await (kind === "user" ? userImpactAction({ userId: id }) : contentImpactAction({ kind, id }));
        if (res?.ok) setImpact(kind === "user" ? { ...res.data, confirm: res.data.username } : res.data);
        else setError(res?.error ?? "Could not load what this deletes.");
      });
    } else reset();
  }

  function submit() {
    setError(null);
    setFieldError(null);
    startDelete(async () => {
      const common = { reason: reason.trim(), confirm: typed.trim(), password };
      const res = await (kind === "user" ? purgeUserAction({ userId: id, eraseMessages, ...common }) : purgeContentAction({ kind, id, ...common }));
      if (res?.ok) {
        toast.success(res.message ?? "Deleted.");
        setOpen(false);
        reset();
        router.refresh();
      } else {
        setFieldError(res?.fieldErrors?.password ?? res?.fieldErrors?.confirm ?? null);
        setError(res?.fieldErrors ? null : (res?.error ?? "Something went wrong."));
      }
    });
  }

  const counts = Object.entries(impact?.counts ?? {}).filter(([k, n]) => Number(n) > 0 && COUNT_TEXT[k]);
  const blocked = kind === "user" && impact?.protected;
  const reasonOk = reason.trim().length >= 10;
  const typedOk = impact?.confirm && typed.trim() === impact.confirm;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size={size} className={cn("text-destructive-text hover:text-destructive-text", className)}>
          <AppIcon name="trash" size={16} />
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent onInteractOutside={(e) => pending && e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Permanently delete this {noun}?</DialogTitle>
          <DialogDescription>
            Step {step + 1} of {STEPS.length}. This is not the same as removing: a permanent deletion cannot be undone, restored or appealed.
          </DialogDescription>
        </DialogHeader>
        <Progress step={step} />

        {step === 0 && (
          <div className="space-y-3 text-sm">
            {loading || (!impact && !error) ? (
              <p className="text-muted-foreground" role="status">Checking what this deletes…</p>
            ) : impact ? (
              <>
                <p>
                  <span className="font-semibold break-words">{kind === "user" ? `@${impact.username}` : impact.label}</span>
                  {kind !== "user" && impact.owner && <span className="text-muted-foreground"> · by @{impact.owner}</span>}
                </p>
                <div className="border-destructive-text/30 bg-destructive-soft rounded-lg border p-3">
                  <p className="text-destructive-text mb-1.5 font-semibold">Deleted together with it:</p>
                  {counts.length === 0 ? (
                    <p className="text-destructive-text/90">Nothing else is attached to it.</p>
                  ) : (
                    <ul className="text-destructive-text/90 list-disc space-y-0.5 pl-5">
                      {counts.map(([k, n]) => <li key={k}>{COUNT_TEXT[k](Number(n))}</li>)}
                    </ul>
                  )}
                </div>
                {kind === "post" && <p className="text-muted-foreground">Plain reposts of it are deleted too. Quote reposts stay as ordinary posts. The author is told, with your reason.</p>}
                {kind === "community" && <p className="text-muted-foreground">Every post in the community goes, with its comments and likes. The owner is told, with your reason.</p>}
                {kind === "user" && (
                  <p className="text-muted-foreground">
                    The profile, posts, comments, likes, projects, connections and uploaded files are erased, and the sign-in account is deleted. Payment records and reports about the account are kept where the law requires it.
                  </p>
                )}
                {blocked && <p role="alert" className="text-destructive-text font-semibold">This member holds a staff role. Remove the role first (Staff &amp; roles), then erase the account.</p>}
              </>
            ) : null}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor={`purge-reason-${id}`} className="text-[13px] font-semibold">Why is this being deleted?</Label>
              <Textarea id={`purge-reason-${id}`} rows={3} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Kept in the audit log, and shown to the owner." />
              <p className="text-muted-foreground text-xs">At least 10 characters ({reason.trim().length}).</p>
            </div>
            {kind === "user" && (
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" checked={eraseMessages} onChange={(e) => setEraseMessages(e.target.checked)} className="mt-0.5" />
                <span>Also erase the messages this member sent. Otherwise messages already delivered to others stay, without the member&rsquo;s name.</span>
              </label>
            )}
            <label className="flex items-start gap-2 text-sm font-medium">
              <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} className="mt-0.5" />
              <span>I understand this cannot be undone and nothing can be recovered from the console.</span>
            </label>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor={`purge-typed-${id}`} className="text-[13px] font-semibold">
                Type <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-[13px]">{impact?.confirm}</code> to confirm
              </Label>
              <Input id={`purge-typed-${id}`} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoCapitalize="off" spellCheck={false} aria-invalid={Boolean(typed) && !typedOk ? true : undefined} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`purge-pass-${id}`} className="text-[13px] font-semibold">Your password</Label>
              <Input id={`purge-pass-${id}`} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" aria-invalid={fieldError ? true : undefined} />
              {fieldError ? <p role="alert" className="text-destructive-text text-xs">{fieldError}</p> : <p className="text-muted-foreground text-xs">Asked again so a left-open session cannot delete anything.</p>}
            </div>
          </div>
        )}

        {error && <p role="alert" className="text-destructive-text text-sm">{error}</p>}

        <DialogFooter>
          {step === 0 ? (
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          ) : (
            <Button variant="ghost" onClick={() => { setStep(step - 1); setError(null); }} disabled={pending}>Back</Button>
          )}
          {step < 2 ? (
            <Button onClick={() => { setStep(step + 1); setError(null); }} disabled={step === 0 ? !impact || blocked : !(reasonOk && understood)}>
              Continue
            </Button>
          ) : (
            <Button variant="destructive" onClick={submit} disabled={pending || !typedOk || password.length === 0}>
              {pending ? "Deleting…" : `Delete ${noun} permanently`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
