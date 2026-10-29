"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FileUpload } from "@/components/academy/file-upload";
import { submitAssignmentAction } from "@/lib/actions/academy";

const field = "border-input bg-card w-full rounded-lg border px-3 text-sm";

/** Hand in work: a repository, a live demo, notes and/or a file, depending on what the assignment accepts. The database checks the rest. */
export function SubmissionForm({ assignment }) {
  const router = useRouter();
  const [repo, setRepo] = useState("");
  const [demo, setDemo] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState(null);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState(null);
  const [pending, start] = useTransition();
  const has = (f) => assignment.formats.includes(f);

  function submit(e) {
    e.preventDefault();
    setErrors({});
    setMessage(null);
    start(async () => {
      const res = await submitAssignmentAction({ assignmentId: assignment.id, repo, demo, notes, fileId: file?.fileId ?? "" });
      if (res.ok) {
        toast.success(res.message);
        setRepo(""); setDemo(""); setNotes(""); setFile(null);
        router.refresh();
      } else {
        setErrors(res.fieldErrors ?? {});
        setMessage(res.error);
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {has("repo") && (
        <div>
          <label htmlFor={`repo-${assignment.id}`} className="text-sm font-semibold">Repository link</label>
          <input id={`repo-${assignment.id}`} type="url" inputMode="url" placeholder="https://github.com/you/project" value={repo} onChange={(e) => setRepo(e.target.value)} className={`${field} mt-1.5 h-10`} aria-invalid={Boolean(errors.repo) || undefined} aria-describedby={errors.repo ? `repo-err-${assignment.id}` : undefined} />
          {errors.repo && <p id={`repo-err-${assignment.id}`} className="text-destructive-text mt-1 text-sm">{errors.repo}</p>}
        </div>
      )}
      {has("demo") && (
        <div>
          <label htmlFor={`demo-${assignment.id}`} className="text-sm font-semibold">Live demo link</label>
          <input id={`demo-${assignment.id}`} type="url" inputMode="url" placeholder="https://your-project.example.com" value={demo} onChange={(e) => setDemo(e.target.value)} className={`${field} mt-1.5 h-10`} aria-invalid={Boolean(errors.demo) || undefined} />
          {errors.demo && <p className="text-destructive-text mt-1 text-sm">{errors.demo}</p>}
        </div>
      )}
      {has("text") && (
        <div>
          <label htmlFor={`notes-${assignment.id}`} className="text-sm font-semibold">Notes for your mentor</label>
          <textarea id={`notes-${assignment.id}`} rows={4} maxLength={4000} value={notes} onChange={(e) => setNotes(e.target.value)} className={`${field} mt-1.5 py-2`} placeholder="What did you build? What was hard? What would you improve?" />
        </div>
      )}
      {has("file") && (
        <div>
          <p className="text-sm font-semibold">File</p>
          <div className="mt-1.5"><FileUpload purpose="academy_submission" onChange={setFile} hint="A PDF or an image, up to 10 MB." /></div>
        </div>
      )}
      <p role="alert" className={message ? "bg-destructive-soft text-destructive-text rounded-lg px-3 py-2 text-sm font-medium" : "sr-only"}>{message}</p>
      <Button type="submit" disabled={pending}><Send aria-hidden />{pending ? "Sending…" : "Submit for review"}</Button>
    </form>
  );
}
