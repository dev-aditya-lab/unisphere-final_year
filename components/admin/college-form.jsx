"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { updateCollegeAction } from "@/lib/actions/admin";

const field = "border-input bg-card h-9 w-full rounded-md border px-2 text-sm";
const MODES = [
  { value: "student_id", label: "Student ID: members enter their ID, checked privately against the college's list" },
  { value: "manual", label: "Manual: staff review each request" },
  { value: "invite", label: "Invite code: members redeem a code from the college" },
];

export function CollegeForm({ college, canEdit }) {
  const [v, setV] = useState({ name: college.name, shortName: college.short_name ?? "", city: college.city ?? "", state: college.state ?? "", verificationMode: college.verification_mode, isActive: college.is_active });
  const [error, setError] = useState(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  function save(e) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await updateCollegeAction({ id: college.id, ...v });
      if (res.ok) {
        toast.success("College saved.");
        router.refresh();
      } else setError(res.fieldErrors ? Object.values(res.fieldErrors)[0] : res.error);
    });
  }

  return (
    <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5"><Label htmlFor={`n-${college.id}`} className="text-[13px] font-semibold">Name</Label><input id={`n-${college.id}`} value={v.name} onChange={set("name")} disabled={!canEdit} className={field} /></div>
      <div className="space-y-1.5"><Label htmlFor={`s-${college.id}`} className="text-[13px] font-semibold">Short name</Label><input id={`s-${college.id}`} value={v.shortName} onChange={set("shortName")} disabled={!canEdit} className={field} /></div>
      <div className="space-y-1.5"><Label htmlFor={`c-${college.id}`} className="text-[13px] font-semibold">City</Label><input id={`c-${college.id}`} value={v.city} onChange={set("city")} disabled={!canEdit} className={field} /></div>
      <div className="space-y-1.5"><Label htmlFor={`st-${college.id}`} className="text-[13px] font-semibold">State</Label><input id={`st-${college.id}`} value={v.state} onChange={set("state")} disabled={!canEdit} className={field} /></div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor={`m-${college.id}`} className="text-[13px] font-semibold">How members are verified</Label>
        <select id={`m-${college.id}`} value={v.verificationMode} onChange={set("verificationMode")} disabled={!canEdit} className={field}>
          {MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </div>
      <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={v.isActive} onChange={set("isActive")} disabled={!canEdit} className="size-4" /> Active (members can choose this college when signing up)</label>
      {error && <p role="alert" className="text-destructive text-sm sm:col-span-2">{error}</p>}
      {canEdit && <div className="sm:col-span-2"><Button type="submit" size="sm" disabled={pending}>{pending ? "Saving…" : "Save college"}</Button></div>}
    </form>
  );
}
