"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { saveAcademicItemAction } from "@/lib/actions/admin";

function useSave(onDone) {
  const [error, setError] = useState(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  function run(payload) {
    setError(null);
    startTransition(async () => {
      let res;
      try {
        res = await saveAcademicItemAction(payload);
      } catch {
        res = { ok: false, error: "Could not reach the server. Try again." };
      }
      if (res?.ok) {
        toast.success(res.message ?? "Saved.");
        onDone?.();
        router.refresh();
      } else setError(res?.fieldErrors ? Object.values(res.fieldErrors)[0] : (res?.error ?? "Something went wrong."));
    });
  }
  return { run, error, pending, setError };
}

/** Fix a name (a typo, a different spelling). Members who chose it see the new name. */
export function RenameAcademicDialog({ item }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(item.name);
  const { run, error, pending, setError } = useSave(() => setOpen(false));
  const noun = item.kind === "department" ? "department" : "course";
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setError(null); }}>
      <DialogTrigger asChild><Button size="sm" variant="outline">Rename</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename this {noun}</DialogTitle>
          <DialogDescription>{item.college_name}. Everyone who chose it sees the new name.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor={`rename-${item.id}`} className="text-[13px] font-semibold">Name</Label>
          <Input id={`rename-${item.id}`} placeholder="Enter the new name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
        </div>
        {error && <p role="alert" className="text-destructive-text text-sm">{error}</p>}
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={pending || name.trim().length < 2} onClick={() => run({ kind: item.kind, id: item.id, name, isActive: item.is_active })}>{pending ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Show or hide it in the pickers. Profiles that already use it keep it. */
export function AcademicVisibility({ item }) {
  const { run, pending } = useSave();
  return (
    <Switch
      checked={item.is_active}
      disabled={pending}
      aria-label={`${item.name} is offered to members`}
      onCheckedChange={(v) => run({ kind: item.kind, id: item.id, name: item.name, isActive: v })}
    />
  );
}
