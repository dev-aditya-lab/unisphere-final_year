"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { saveSettingAction } from "@/lib/actions/academy-admin";

/** One Academy setting. The server checks the value's shape again and the database checks who may change it (money and tax keys need pricing access). */
export function SettingRow({ settingKey, label, hint, type = "text", initial, options = [], disabled = false }) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [error, setError] = useState(null);
  const [pending, start] = useTransition();
  const changed = String(value) !== String(initial);
  function save(e) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await saveSettingAction(settingKey, type === "checkbox" ? Boolean(value) : String(value));
      if (res.ok) { toast.success(res.message); router.refresh(); } else setError(res.fieldErrors?.value ?? res.error);
    });
  }
  const id = `s-${settingKey}`;
  return (
    <form onSubmit={save} className="grid gap-2 py-4 sm:grid-cols-[minmax(0,18rem)_1fr] sm:items-start sm:gap-6" noValidate>
      <div><label htmlFor={id} className="text-[13px] font-semibold">{label}</label>{hint && <p className="text-muted-foreground mt-0.5 text-xs">{hint}</p>}</div>
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {type === "checkbox" ? <input id={id} type="checkbox" checked={Boolean(value)} disabled={disabled} onChange={(e) => setValue(e.target.checked)} className="accent-primary size-4" />
            : type === "select" ? <select id={id} value={value} disabled={disabled} onChange={(e) => setValue(e.target.value)} className="border-input bg-card h-9 rounded-md border px-2 text-sm">{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
            : <input id={id} value={value} disabled={disabled} onChange={(e) => setValue(e.target.value)} className="border-input bg-card h-9 w-full max-w-xs rounded-md border px-3 text-sm" aria-invalid={Boolean(error) || undefined} />}
          {!disabled && <Button type="submit" size="sm" variant="outline" disabled={pending || !changed}>{pending ? "Saving…" : "Save"}</Button>}
        </div>
        <p role="alert" className={error ? "text-destructive-text text-xs" : "sr-only"}>{error}</p>
      </div>
    </form>
  );
}
