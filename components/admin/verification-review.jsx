"use client";

import { Check, CircleHelp, X } from "lucide-react";
import { ActionDialog, QuickAction } from "@/components/admin/action-dialog";
import { reviewVerificationAction } from "@/lib/actions/admin";

export function VerificationReview({ id }) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-4">
      <QuickAction label="Approve" icon={Check} variant="default" action={reviewVerificationAction} args={{ id, decision: "approved" }} successMessage="Approved. The member was notified." />
      <ActionDialog
        label="Ask for more info" icon={CircleHelp} title="Ask for more information"
        description="The member sees this message and can submit a new request."
        action={reviewVerificationAction} args={{ id, decision: "needs_info" }} reasonLabel="What do you need?"
      />
      <ActionDialog
        label="Reject" icon={X} destructive title="Reject this request"
        description="Say why, so the member can fix it. They can apply again."
        action={reviewVerificationAction} args={{ id, decision: "rejected" }} reasonLabel="Reason shown to the member"
      />
    </div>
  );
}
