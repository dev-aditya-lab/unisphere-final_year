"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { saveSkillAction } from "@/lib/actions/admin";

/** Runs a Server Action and refreshes the page; reports the server's message when it refuses. */
function useSave(onDone) {
  const [error, setError] = useState(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  function run(payload) {
    setError(null);
    startTransition(async () => {
      let res;
      try {
        res = await saveSkillAction(payload);
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

/** Add a skill or interest, or edit one. `categories` are the existing ones, offered as suggestions (a new one can be typed). */
export function SkillDialog({ skill = null, kind = "skill", categories = [], label, variant = "outline" }) {
  const [open, setOpen] = useState(false);
  const blank = { id: null, kind, name: "", category: categories[0] ?? "", isActive: true, sortOrder: null };
  const initial = skill ? { id: skill.id, kind: skill.kind, name: skill.name, category: skill.category, isActive: skill.is_active, sortOrder: skill.sort_order } : blank;
  const [f, setF] = useState(initial);
  const { run, error, pending, setError } = useSave(() => {
    setOpen(false);
    if (!skill) setF(blank);
  });
  const listId = `skill-cats-${skill?.id ?? "new"}`;
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setError(null); }}>
      <DialogTrigger asChild>
        <Button variant={variant} size="sm">{skill ? null : <Plus />}{label}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{skill ? `Edit ${skill.name}` : `Add a ${f.kind}`}</DialogTitle>
          <DialogDescription>Members see this in the pickers on their profile, in onboarding and on projects. They can still type anything that is not listed.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor={`${listId}-name`} className="text-[13px] font-semibold">Name</Label>
            <Input id={`${listId}-name`} value={f.name} maxLength={40} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`${listId}-cat`} className="text-[13px] font-semibold">Category</Label>
              <Input id={`${listId}-cat`} list={listId} value={f.category} maxLength={40} onChange={(e) => setF({ ...f, category: e.target.value })} />
              <datalist id={listId}>{categories.map((c) => <option key={c} value={c} />)}</datalist>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${listId}-kind`} className="text-[13px] font-semibold">Shown as</Label>
              <select id={`${listId}-kind`} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} className="border-input bg-card h-10 w-full rounded-lg border px-3 text-sm">
                <option value="skill">Skill</option>
                <option value="interest">Interest</option>
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch id={`${listId}-on`} checked={f.isActive} onCheckedChange={(v) => setF({ ...f, isActive: v })} />
            <Label htmlFor={`${listId}-on`} className="text-sm">Suggested to members</Label>
          </div>
        </div>
        {error && <p role="alert" className="text-destructive-text text-sm">{error}</p>}
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={pending || !f.name.trim() || f.category.trim().length < 2} onClick={() => run(f)}>{pending ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** What members have typed that is not listed: pick a category once, then one click lists each one. */
export function UnlistedAdder({ unlisted, kind, categories }) {
  const [category, setCategory] = useState(categories[0] ?? "");
  const { run, pending, error } = useSave();
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="unlisted-cat" className="text-[13px] font-semibold">Add to category</label>
        <select id="unlisted-cat" value={category} onChange={(e) => setCategory(e.target.value)} className="border-input bg-card h-9 rounded-lg border px-3 text-sm">
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div className="flex flex-wrap gap-2">
        {unlisted.map((u) => (
          <span key={u.name} className="inline-flex items-center gap-1.5">
            <Button type="button" size="xs" variant="outline" disabled={pending || !category} onClick={() => run({ id: null, kind, name: u.name, category, isActive: true, sortOrder: null })}>
              <Plus /> {u.name}
            </Button>
            <span className="text-muted-foreground text-xs tabular-nums" title="Members using it">{u.members}</span>
          </span>
        ))}
      </div>
      {error && <p role="alert" className="text-destructive-text text-sm">{error}</p>}
    </div>
  );
}

/** Show or hide a listed item without losing it. */
export function VisibilitySwitch({ skill }) {
  const { run, pending } = useSave();
  return (
    <Switch
      checked={skill.is_active}
      disabled={pending}
      aria-label={`${skill.name} is suggested to members`}
      onCheckedChange={(v) => run({ id: skill.id, kind: skill.kind, name: skill.name, category: skill.category, isActive: v, sortOrder: skill.sort_order })}
    />
  );
}
