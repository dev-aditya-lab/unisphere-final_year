"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { importRosterAction } from "@/lib/actions/admin";

export function RosterImport({ collegeId }) {
  const [text, setText] = useState("");
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef(null);
  const router = useRouter();

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 400_000) return setError("That file is too large. Import up to 5,000 IDs at a time.");
    setText(await file.text());
    setError(null);
  }

  function submit(e) {
    e.preventDefault();
    setError(null);
    setSummary(null);
    startTransition(async () => {
      const res = await importRosterAction({ collegeId, text });
      if (res.ok) {
        setSummary({ added: res.added, duplicates: res.duplicates, invalid: res.invalid, invalidLines: res.invalidLines });
        toast.success(`${res.added} new ID(s) added.`);
        setText("");
        router.refresh();
      } else setError(res.error);
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="roster-text" className="text-[13px] font-semibold">Student IDs</Label>
        <Textarea id="roster-text" value={text} onChange={(e) => setText(e.target.value)} rows={8} spellCheck={false} autoComplete="off" className="font-mono text-xs" placeholder={"ID001, 2024\nID002, 2024"} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input ref={fileRef} type="file" accept=".csv,.txt,text/csv,text/plain" className="sr-only" onChange={onFile} aria-label="Load IDs from a CSV or text file" />
        <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}><Upload aria-hidden="true" /> Load a CSV file</Button>
        <Button type="submit" size="sm" disabled={pending || !text.trim()}>{pending ? "Importing…" : "Import"}</Button>
      </div>
      {error && <p role="alert" className="text-destructive-text text-sm">{error}</p>}
      {summary && (
        <p role="status" className="bg-muted rounded-md px-3 py-2 text-[13px]">
          {summary.added} added, {summary.duplicates} already on the list{summary.invalid ? `, ${summary.invalid} line(s) skipped as invalid (first lines: ${summary.invalidLines.join(", ")})` : ""}.
        </p>
      )}
    </form>
  );
}
