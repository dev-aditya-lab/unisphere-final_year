"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { grantRoleAction } from "@/lib/actions/admin";

const ROLES = [
  { value: "moderator", label: "Moderator" },
  { value: "support_agent", label: "Support agent" },
  { value: "college_admin", label: "College admin", adminOnly: true },
  { value: "global_admin", label: "Global admin", adminOnly: true },
  { value: "privacy_officer", label: "Privacy officer (platform-wide; handles privacy requests and breaches)", adminOnly: true },
  { value: "academy_admin", label: "Academy administrator (platform-wide; everything in the Academy)", adminOnly: true },
  { value: "course_manager", label: "Academy course manager (courses, publishing, live classes; no prices or payments)", adminOnly: true },
  { value: "finance_manager", label: "Academy finance manager (prices, coupons, orders, refunds; no certificates)", adminOnly: true },
  { value: "academy_mentor", label: "Academy mentor (grades work in the courses they are assigned to)", adminOnly: true },
  { value: "academy_support", label: "Academy support (sees students, posts announcements)", adminOnly: true },
];

export function GrantRoleForm({ colleges, canGrantAdmin }) {
  const [username, setUsername] = useState("");
  const [role, setRole] = useState("moderator");
  const [collegeId, setCollegeId] = useState(colleges[0]?.id ?? "");
  const [error, setError] = useState(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const roles = ROLES.filter((r) => canGrantAdmin || !r.adminOnly);
  const scoped = !["global_admin", "privacy_officer", "academy_admin", "course_manager", "finance_manager", "academy_mentor", "academy_support"].includes(role);

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
      {error && <p role="alert" className="text-destructive-text text-sm">{error}</p>}
      <Button type="submit" disabled={pending || !username.trim()}>{pending ? "Granting…" : "Grant role"}</Button>
    </form>
  );
}
