"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { publishAnnouncementAction } from "@/lib/actions/campus";

export function AnnouncementForm({ colleges }) {
  const [collegeId, setCollegeId] = useState(colleges[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);
  const [expiresAt, setExpiresAt] = useState("");
  const [errors, setErrors] = useState({});
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const field = "border-input bg-card h-9 w-full rounded-md border px-2 text-sm";

  function submit(e) {
    e.preventDefault();
    setErrors({});
    startTransition(async () => {
      const res = await publishAnnouncementAction({ collegeId, title, body, pinned, expiresAt: expiresAt || null });
      if (res.ok) {
        toast.success("Announcement published.");
        setTitle("");
        setBody("");
        setPinned(false);
        setExpiresAt("");
        router.refresh();
      } else setErrors({ ...res.fieldErrors, _form: res.error });
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {colleges.length > 1 && (
        <div className="space-y-1.5">
          <Label htmlFor="ann-college" className="text-[13px] font-semibold">College</Label>
          <select id="ann-college" value={collegeId} onChange={(e) => setCollegeId(e.target.value)} className={field}>
            {colleges.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="ann-title" className="text-[13px] font-semibold">Title</Label>
        <input id="ann-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} className={field} required />
        {errors.title && <p className="text-destructive-text text-xs">{errors.title}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ann-body" className="text-[13px] font-semibold">Message</Label>
        <Textarea id="ann-body" value={body} onChange={(e) => setBody(e.target.value)} rows={6} maxLength={5000} required />
        {errors.body && <p className="text-destructive-text text-xs">{errors.body}</p>}
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} className="size-4" /> Pin to the top
        </label>
        <label className="text-[13px]">
          <span className="text-muted-foreground mb-1 block text-xs font-medium">Hide after (optional)</span>
          <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className="border-input bg-card h-9 rounded-md border px-2 text-sm" />
        </label>
      </div>
      {errors._form && <p role="alert" className="text-destructive-text text-sm">{errors._form}</p>}
      <Button type="submit" disabled={pending || !title.trim() || !body.trim()}>{pending ? "Publishing…" : "Publish to the college"}</Button>
      <p className="text-muted-foreground text-xs">Everyone in the college is notified. You cannot unsend a notification, so double-check the text.</p>
    </form>
  );
}
