"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { grantRoleAction } from "@/lib/actions/admin";

const ROLES = [
  { value: "moderator", label: "Moderator" },
  { value: "verification_staff", label: "Verification staff" },
  { value: "support_agent", label: "Support agent" },
  { value: "college_admin", label: "College admin", adminOnly: true },
  { value: "global_admin", label: "Global admin", adminOnly: true },
];

export function GrantRoleForm({ colleges, canGrantAdmin }) {
  const [username, setUsername] = useState("");
  const [role, setRole] = useState("moderator");
  const [collegeId, setCollegeId] = useState(colleges[0]?.id ?? "");
  const [error, setError] = useState(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const roles = ROLES.filter((r) => canGrantAdmin || !r.adminOnly);
  const scoped = role !== "global_admin";

  function submit(e) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await grantRoleAction({ username, role, collegeId: scoped ? collegeId : null });
      if (res.ok) {
        toast.success("Role granted.");
        setUsername("");
        router.refresh();
      } else setError(res.fieldErrors?.username ?? res.error);
    });
  }

  const field = "border-input bg-card h-9 w-full rounded-md border px-2 text-sm";
  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="grant-username" className="text-[13px] font-semibold">Username</Label>
        <input id="grant-username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="exact username, no @" autoComplete="off" className={field} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="grant-role" className="text-[13px] font-semibold">Role</Label>
        <select id="grant-role" value={role} onChange={(e) => setRole(e.target.value)} className={field}>
          {roles.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </div>
      {scoped && (
        <div className="space-y-1.5">
          <Label htmlFor="grant-college" className="text-[13px] font-semibold">College</Label>
          <select id="grant-college" value={collegeId} onChange={(e) => setCollegeId(e.target.value)} className={field} required>
            {colleges.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}
      {error && <p role="alert" className="text-destructive text-sm">{error}</p>}
      <Button type="submit" disabled={pending || !username.trim()}>{pending ? "Granting…" : "Grant role"}</Button>
    </form>
  );
}
