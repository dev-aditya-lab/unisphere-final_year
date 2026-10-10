"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { addCollegeDomainAction, removeCollegeDomainAction, updateCollegeAction } from "@/lib/actions/admin";

const field = "border-input bg-card h-9 w-full rounded-md border px-2 text-sm";
const AUDIENCES = ["student", "alumni", "faculty", "staff"];
const MODES = [
  { value: "email_domain", label: "Email domain — members confirm a college email address" },
  { value: "manual", label: "Manual — staff review each request" },
  { value: "invite", label: "Invite code — members redeem a code from the college" },
];

export function CollegeForm({ college, canEdit }) {
  const [v, setV] = useState({ name: college.name, shortName: college.short_name ?? "", city: college.city ?? "", state: college.state ?? "", verificationMode: college.verification_mode, isActive: college.is_active });
  const [domain, setDomain] = useState("");
  const [audiences, setAudiences] = useState(["student"]);
  const [error, setError] = useState(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  const run = (fn, done) => startTransition(async () => {
    setError(null);
    const res = await fn();
    if (res.ok) { toast.success(done); router.refresh(); } else setError(res.fieldErrors ? Object.values(res.fieldErrors)[0] : res.error);
  });

  return (
    <div className="space-y-5">
      <form onSubmit={(e) => { e.preventDefault(); run(() => updateCollegeAction({ id: college.id, ...v }), "College saved."); }} className="grid gap-3 sm:grid-cols-2">
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
        {canEdit && <div className="sm:col-span-2"><Button type="submit" size="sm" disabled={pending}>{pending ? "Saving…" : "Save college"}</Button></div>}
      </form>

      <div className="border-t pt-4">
        <h3 className="text-sm font-semibold">Verified email domains</h3>
        {college.domains.length === 0 ? <p className="text-muted-foreground mt-1 text-[13px]">None yet.</p> : (
          <ul className="mt-2 flex flex-wrap gap-2">
            {college.domains.map((d) => (
              <li key={d.id} className="bg-muted flex items-center gap-1.5 rounded-md py-1 pr-1 pl-2.5 text-[13px]">
                <span className="font-mono">{d.domain}</span><span className="text-muted-foreground">({d.audiences.join(", ")})</span>
                {canEdit && <button type="button" aria-label={`Remove ${d.domain}`} disabled={pending} onClick={() => run(() => removeCollegeDomainAction({ id: d.id }), "Domain removed.")} className="hover:bg-background rounded p-1"><X className="size-3.5" /></button>}
              </li>
            ))}
          </ul>
        )}
        {canEdit && (
          <form onSubmit={(e) => { e.preventDefault(); run(async () => { const r = await addCollegeDomainAction({ collegeId: college.id, domain, audiences }); if (r.ok) setDomain(""); return r; }, "Domain added."); }} className="mt-3 flex flex-wrap items-end gap-3">
            <div className="space-y-1.5"><Label htmlFor={`d-${college.id}`} className="text-[13px] font-semibold">Add a domain</Label><input id={`d-${college.id}`} value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="students.college.edu" className={`${field} w-64`} /></div>
            <fieldset className="flex gap-3 text-sm"><legend className="sr-only">Who this domain proves</legend>
              {AUDIENCES.map((a) => <label key={a} className="flex items-center gap-1.5 capitalize"><input type="checkbox" checked={audiences.includes(a)} onChange={(e) => setAudiences((cur) => e.target.checked ? [...cur, a] : cur.filter((x) => x !== a))} className="size-4" />{a}</label>)}
            </fieldset>
            <Button type="submit" size="sm" variant="secondary" disabled={pending || !domain.trim()}>Add</Button>
          </form>
        )}
      </div>
      {error && <p role="alert" className="text-destructive text-sm">{error}</p>}
    </div>
  );
}
