"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

/**
 * A button that opens a confirmation dialog, optionally collecting a reason, then calls a Server Action.
 * `action` is a Server Action; `args` is plain data merged with `{ [reasonField]: reason }`.
 * The dialog stays open and shows the message if the server refuses, so nothing fails silently.
 */
export function ActionDialog({
  label, title, description, action, args, reasonField = "reason", reasonLabel = "Reason", reasonRequired = true, askReason = true,
  confirmLabel, variant = "outline", size = "sm", destructive = false, successMessage, onDoneHref, icon: Icon, disabled = false, children,
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function run() {
    setError(null);
    startTransition(async () => {
      const res = await action({ ...args, ...(askReason ? { [reasonField]: reason.trim() || undefined } : {}) });
      if (res?.ok) {
        toast.success(res.message ?? successMessage ?? "Done.");
        setOpen(false);
        setReason("");
        if (onDoneHref) router.push(onDoneHref);
        else router.refresh();
      } else {
        setError(res?.fieldErrors?.[reasonField] ?? res?.error ?? "Something went wrong.");
      }
    });
  }

  const missing = askReason && reasonRequired && reason.trim().length < 3;
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setError(null); }}>
      <DialogTrigger asChild>
        <Button variant={destructive ? "outline" : variant} size={size} disabled={disabled} className={destructive ? "text-destructive-text hover:text-destructive-text" : undefined}>
          {Icon && <Icon aria-hidden="true" />}
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title ?? label}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
        {askReason && (
          <div className="space-y-1.5">
            <Label htmlFor={`reason-${reasonField}-${label}`} className="text-[13px] font-semibold">
              {reasonLabel} {!reasonRequired && <span className="text-muted-foreground font-normal">(optional)</span>}
            </Label>
            <Textarea id={`reason-${reasonField}-${label}`} placeholder="e.g. Repeated spam after an earlier warning" rows={3} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} aria-invalid={Boolean(error) || undefined} />
          </div>
        )}
        {error && (
          <p role="alert" className="text-destructive-text text-sm">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant={destructive ? "destructive" : "default"} onClick={run} disabled={pending || missing}>
            {pending ? "Working…" : (confirmLabel ?? label)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** One-click action (no dialog) for low-risk, reversible steps such as claiming a report. */
export function QuickAction({ label, action, args, variant = "outline", size = "sm", successMessage, icon: Icon }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <Button
      variant={variant}
      size={size}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await action(args);
          if (res?.ok) {
            if (successMessage) toast.success(successMessage);
            router.refresh();
          } else toast.error(res?.error ?? "Something went wrong.");
        })
      }
    >
      {Icon && <Icon aria-hidden="true" />}
      {pending ? "Working…" : label}
    </Button>
  );
}
