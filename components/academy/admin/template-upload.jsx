"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FileUpload } from "@/components/academy/file-upload";
import { createTemplateVersionAction } from "@/lib/actions/academy-admin";

/** Upload a PDF as a new draft version of a template. The server reads its page count and size and refuses anything that is not a usable PDF. */
export function TemplateUpload({ templateId }) {
  const router = useRouter();
  const [file, setFile] = useState(null);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState(null);
  const [pending, start] = useTransition();
  function submit(e) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await createTemplateVersionAction({ templateId, fileId: file.fileId, notes });
      if (res.ok) { toast.success(res.message); setFile(null); setNotes(""); router.push(`/admin/academy/templates/${templateId}?v=${res.id}`); router.refresh(); } else setError(res.error);
    });
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <FileUpload purpose="academy_template" accept="application/pdf" label="Choose the PDF" onChange={setFile} hint="Your own design as a PDF, up to 8 MB, 20 pages at most. It is kept as it is: fields are drawn over it, never edited into it." />
      <div><label htmlFor="tu-notes" className="text-[13px] font-semibold">What changed (optional)</label><input id="tu-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} className="border-input bg-card mt-1 h-9 w-full rounded-md border px-3 text-sm" /></div>
      <p role="alert" className={error ? "text-destructive-text text-sm" : "sr-only"}>{error}</p>
      <Button type="submit" size="sm" disabled={pending || !file}>{pending ? "Reading the PDF…" : "Add as a new version"}</Button>
    </form>
  );
}
