"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { setFlagAction, setSettingAction } from "@/lib/actions/admin";

const field = "border-input bg-card h-9 w-full max-w-md rounded-md border px-2 text-sm";

/** One platform setting with its own Save button, so a mistake in one field never changes another. */
export function SettingRow({ name, meta, value, updatedAt, disabled }) {
  const initial = meta.kind === "json" ? JSON.stringify(value, null, 2) : meta.kind === "boolean" ? Boolean(value) : (value ?? "");
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);

  function save(next = draft) {
    setError(null);
    let parsed = next;
    try {
      if (meta.kind === "json") parsed = JSON.parse(next);
      else if (meta.kind === "number") parsed = Number(next);
    } catch {
      setError("That is not valid JSON.");
      return;
    }
    startTransition(async () => {
      const res = await setSettingAction({ key: name, value: parsed });
      if (res.ok) {
        toast.success(`${meta.label} saved.`);
        router.refresh();
      } else setError(res.error);
    });
  }

  const id = `setting-${name}`;
  return (
    <div className="py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <label htmlFor={id} className={`text-sm font-semibold ${meta.danger ? "text-destructive" : ""}`}>{meta.label}</label>
          {meta.hint && <p id={`${id}-hint`} className="text-muted-foreground text-[13px]">{meta.hint}</p>}
          {updatedAt && <p className="text-muted-foreground text-xs">Last changed {updatedAt}</p>}
        </div>
        {meta.kind === "boolean" && (
          <Switch id={id} checked={Boolean(draft)} disabled={disabled || pending} aria-describedby={meta.hint ? `${id}-hint` : undefined} onCheckedChange={(v) => { setDraft(v); save(v); }} />
        )}
      </div>
      {meta.kind !== "boolean" && (
        <div className="mt-2 space-y-2">
          {meta.kind === "markdown" || meta.kind === "json" || meta.kind === "longtext" ? (
            <Textarea id={id} value={draft} rows={meta.kind === "markdown" ? 8 : meta.kind === "json" ? 9 : 3} onChange={(e) => setDraft(e.target.value)} disabled={disabled} className={meta.kind === "json" ? "font-mono text-xs" : undefined} aria-describedby={meta.hint ? `${id}-hint` : undefined} />
          ) : (
            <input id={id} type={meta.kind === "number" ? "number" : "text"} value={draft} onChange={(e) => setDraft(e.target.value)} disabled={disabled} className={field} aria-describedby={meta.hint ? `${id}-hint` : undefined} />
          )}
          {!disabled && (
            <Button size="sm" onClick={() => save()} disabled={!dirty || pending}>{pending ? "Saving…" : "Save"}</Button>
          )}
        </div>
      )}
      {error && <p role="alert" className="text-destructive mt-1 text-sm">{error}</p>}
    </div>
  );
}

export function FlagRow({ name, label, description, enabled, disabled }) {
  const [on, setOn] = useState(enabled);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <div className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <label htmlFor={`flag-${name}`} className="text-sm font-semibold">{label}</label>
        {description && <p className="text-muted-foreground text-[13px]">{description}</p>}
      </div>
      <Switch
        id={`flag-${name}`} checked={on} disabled={disabled || pending}
        onCheckedChange={(next) => {
          setOn(next);
          startTransition(async () => {
            const res = await setFlagAction({ key: name, enabled: next });
            if (res.ok) { toast.success(`${label} ${next ? "enabled" : "disabled"}.`); router.refresh(); }
            else { setOn(!next); toast.error(res.error); }
          });
        }}
      />
    </div>
  );
}
