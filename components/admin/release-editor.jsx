"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { deleteReleaseAction, saveReleaseAction } from "@/lib/actions/feedback";
import { RELEASE_KINDS } from "@/lib/feedback-meta";

const field = "border-input bg-card h-9 rounded-md border px-2 text-sm";

/** Write release notes as a list of tagged changes. Save a draft, or publish to the public changelog. */
export function ReleaseEditor({ release = null, suggestedVersion = "0.9.0" }) {
  const [version, setVersion] = useState(release?.version ?? suggestedVersion);
  const [title, setTitle] = useState(release?.title ?? "");
  const [summary, setSummary] = useState(release?.summary ?? "");
  const [items, setItems] = useState(release?.items?.length ? release.items : [{ kind: "new", text: "" }]);
  const [error, setError] = useState(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const published = Boolean(release?.published_at);

  const setItem = (i, patch) => setItems((list) => list.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));

  function save(publish) {
    setError(null);
    startTransition(async () => {
      const res = await saveReleaseAction({
        id: release?.id ?? null, version, title, summary: summary || undefined, publish: publish || published,
        items: items.filter((i) => i.text.trim()).map((i) => ({ kind: i.kind, text: i.text })),
      });
      if (res.ok) {
        toast.success(publish && !published ? "Published to the changelog." : "Saved.");
        if (!release) { setTitle(""); setSummary(""); setItems([{ kind: "new", text: "" }]); }
        router.refresh();
      } else setError(res.fieldErrors?.version ?? res.fieldErrors?.items ?? res.fieldErrors?.title ?? res.error);
    });
  }

  const uid = release?.id ?? "new";
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[8rem_1fr]">
        <div className="space-y-1.5"><Label htmlFor={`v-${uid}`} className="text-[13px] font-semibold">Version</Label><input id={`v-${uid}`} value={version} onChange={(e) => setVersion(e.target.value)} className={`${field} w-full font-mono`} /></div>
        <div className="space-y-1.5"><Label htmlFor={`t-${uid}`} className="text-[13px] font-semibold">Title</Label><input id={`t-${uid}`} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} className={`${field} w-full`} /></div>
      </div>
      <div className="space-y-1.5"><Label htmlFor={`s-${uid}`} className="text-[13px] font-semibold">One-line summary (optional)</Label><Textarea id={`s-${uid}`} value={summary} onChange={(e) => setSummary(e.target.value)} rows={2} maxLength={300} /></div>
      <fieldset className="min-w-0 space-y-2">
        <legend className="text-[13px] font-semibold">Changes</legend>
        {items.map((it, i) => (
          <div key={i} className="flex gap-2">
            <select aria-label={`Type of change ${i + 1}`} value={it.kind} onChange={(e) => setItem(i, { kind: e.target.value })} className={`${field} max-w-[8.5rem] min-w-0 shrink`}>
              {RELEASE_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
            <input aria-label={`Change ${i + 1}`} value={it.text} onChange={(e) => setItem(i, { text: e.target.value })} maxLength={240} className={`${field} min-w-0 flex-1`} placeholder="Describe the change in plain words" />
            <Button type="button" size="icon" variant="ghost" aria-label={`Remove change ${i + 1}`} disabled={items.length === 1} onClick={() => setItems((l) => l.filter((_, idx) => idx !== i))}><Trash2 /></Button>
          </div>
        ))}
        <Button type="button" size="sm" variant="outline" onClick={() => setItems((l) => [...l, { kind: "new", text: "" }])}><Plus /> Add a change</Button>
      </fieldset>
      {error && <p role="alert" className="text-destructive-text text-sm">{error}</p>}
      <div className="flex flex-wrap gap-2">
        {published ? (
          <Button onClick={() => save(true)} disabled={pending}>{pending ? "Saving…" : "Save changes"}</Button>
        ) : (
          <>
            <Button variant="outline" onClick={() => save(false)} disabled={pending}>Save draft</Button>
            <Button onClick={() => save(true)} disabled={pending}>{pending ? "Publishing…" : "Publish"}</Button>
            {release && (
              <Button variant="ghost" className="text-destructive-text" disabled={pending} onClick={() => startTransition(async () => { const r = await deleteReleaseAction({ id: release.id }); r.ok ? (toast.success("Draft deleted."), router.refresh()) : toast.error(r.error); })}>Delete draft</Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
