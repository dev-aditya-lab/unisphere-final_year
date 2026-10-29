"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

const input = "border-input bg-card w-full rounded-md border px-3 text-sm";

// Dates are typed in the administrator's own time zone and sent as an exact instant, so what they see is what is stored.
const toLocalInput = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

/**
 * One form for every simple admin record. `fields` describes the inputs (serialisable data); `action` is a Server Action already
 * bound to what it saves (for example saveEntityAction.bind(null, "category", id)). The server validates again, shows its message
 * at the field, and the database enforces who may do it. Nothing here decides a price, a permission or a status.
 */
// A dropdown with no blank choice shows its first option, so the form must really start with that option chosen; otherwise the box
// looks filled in while the value sent is empty ("Choose one from the list").
const firstChoice = (f) => (f.type === "select" && !f.allowEmpty ? (f.options?.[0]?.value ?? "") : "");

export function EntityForm({ fields, initial = {}, extra = {}, action, submitLabel = "Save", resetOnSuccess = false, onDoneHref = null, compact = false }) {
  const router = useRouter();
  const start = () => Object.fromEntries(fields.map((f) => [f.name, f.type === "datetime" ? toLocalInput(initial[f.name]) : f.type === "checkbox" ? Boolean(initial[f.name] ?? f.default ?? false) : f.type === "multi" ? (initial[f.name] ?? []) : (initial[f.name] ?? f.default ?? firstChoice(f))]));
  const [values, setValues] = useState(start);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState(null);
  const [pending, startTransition] = useTransition();
  const set = (name, v) => setValues((s) => ({ ...s, [name]: v }));

  function submit(e) {
    e.preventDefault();
    setErrors({});
    setMessage(null);
    const payload = Object.fromEntries([...Object.entries(extra), ...fields.map((f) => {
      const v = values[f.name];
      if (f.type === "datetime") return [f.name, v ? new Date(v).toISOString() : ""];
      return [f.name, v];
    })]);
    startTransition(async () => {
      const res = await action(payload);
      if (res?.ok) {
        toast.success(res.message ?? "Saved.");
        if (resetOnSuccess) setValues(start());
        if (onDoneHref) router.push(onDoneHref.replace("{id}", res.id ?? ""));
        else router.refresh();
      } else {
        setErrors(res?.fieldErrors ?? {});
        setMessage(res?.error ?? "That could not be saved.");
      }
    });
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div className={compact ? "grid gap-3 sm:grid-cols-2" : "grid gap-4 sm:grid-cols-2"}>
        {fields.map((f) => {
          const id = `f-${f.name}`;
          const err = errors[f.name];
          const wide = f.wide || f.type === "textarea" || f.type === "multi";
          return (
            <div key={f.name} className={wide ? "sm:col-span-2" : undefined}>
              {f.type === "checkbox" ? (
                <label htmlFor={id} className="flex cursor-pointer items-start gap-2.5 text-sm">
                  <input id={id} type="checkbox" checked={values[f.name]} onChange={(e) => set(f.name, e.target.checked)} className="accent-primary mt-0.5 size-4" />
                  <span><span className="font-semibold">{f.label}</span>{f.hint && <span className="text-muted-foreground block text-xs">{f.hint}</span>}</span>
                </label>
              ) : f.type === "multi" ? (
                <fieldset>
                  <legend className="text-[13px] font-semibold">{f.label}</legend>
                  <div className="mt-1.5 flex max-h-44 flex-wrap gap-x-4 gap-y-1.5 overflow-y-auto">
                    {f.options.map((o) => (
                      <label key={o.value} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={values[f.name].includes(o.value)} onChange={(e) => set(f.name, e.target.checked ? [...values[f.name], o.value] : values[f.name].filter((x) => x !== o.value))} className="accent-primary size-4" />
                        {o.label}
                      </label>
                    ))}
                  </div>
                  {f.hint && <p className="text-muted-foreground mt-1 text-xs">{f.hint}</p>}
                </fieldset>
              ) : (
                <>
                  <label htmlFor={id} className="text-[13px] font-semibold">{f.label}{f.required && <span aria-hidden> *</span>}</label>
                  {f.type === "textarea" ? (
                    <textarea id={id} rows={f.rows ?? 4} value={values[f.name]} onChange={(e) => set(f.name, e.target.value)} placeholder={f.placeholder} className={`${input} mt-1 py-2`} aria-invalid={Boolean(err) || undefined} aria-describedby={err ? `${id}-e` : undefined} />
                  ) : f.type === "select" ? (
                    <select id={id} value={values[f.name]} onChange={(e) => set(f.name, e.target.value)} className={`${input} mt-1 h-9`} aria-invalid={Boolean(err) || undefined}>
                      {f.allowEmpty && <option value="">{f.emptyLabel ?? "None"}</option>}
                      {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  ) : (
                    <input id={id} type={f.type === "datetime" ? "datetime-local" : f.type === "number" ? "number" : "text"} inputMode={f.type === "money" || f.type === "number" ? "decimal" : undefined} value={values[f.name]} onChange={(e) => set(f.name, e.target.value)} placeholder={f.placeholder} min={f.min} max={f.max} step={f.step} className={`${input} mt-1 h-9`} aria-invalid={Boolean(err) || undefined} aria-describedby={err ? `${id}-e` : undefined} />
                  )}
                  {f.hint && <p className="text-muted-foreground mt-1 text-xs">{f.hint}</p>}
                </>
              )}
              {err && <p id={`${id}-e`} role="alert" className="text-destructive-text mt-1 text-xs font-medium">{err}</p>}
            </div>
          );
        })}
      </div>
      <p role="alert" className={message ? "bg-destructive-soft text-destructive-text rounded-md px-3 py-2 text-sm font-medium" : "sr-only"}>{message}</p>
      <Button type="submit" size="sm" disabled={pending}>{pending ? "Saving…" : submitLabel}</Button>
    </form>
  );
}
