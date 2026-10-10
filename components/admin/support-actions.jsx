"use client";

import { QuickAction } from "@/components/admin/action-dialog";
import { setContactStatusAction } from "@/lib/actions/admin";

const NEXT = [
  { status: "in_progress", label: "Mark in progress" },
  { status: "resolved", label: "Mark resolved" },
  { status: "spam", label: "Spam" },
  { status: "new", label: "Reopen" },
];

export function SupportActions({ id, status }) {
  return (
    <div className="ml-auto flex flex-wrap gap-2">
      {NEXT.filter((n) => n.status !== status && !(n.status === "new" && status === "in_progress")).map((n) => (
        <QuickAction key={n.status} label={n.label} action={setContactStatusAction} args={{ id, status: n.status }} />
      ))}
    </div>
  );
}
