"use client";

import { Ban, CircleSlash, Flag, Gavel, Hand, NotebookPen, Sparkles, UserCheck, Trash2 } from "lucide-react";
import { ActionDialog, QuickAction } from "@/components/admin/action-dialog";
import { addReportNoteAction, assignReportAction, resolveReportAction, suggestTriageAction } from "@/lib/actions/admin";

/** Decision buttons for a report. Which ones appear is a UX hint; the database decides what is allowed. */
export function ReportActions({ part, reportId, status, assignee, targetType, protectedOwner, hasOwner, contentRemoved, can = {}, hasSuggestion }) {
  if (part === "triage") {
    return (
      <div className="mt-3">
        <QuickAction label={hasSuggestion ? "Refresh suggestion" : "Suggest with AI"} icon={Sparkles} action={suggestTriageAction} args={{ id: reportId }} successMessage="Suggestion ready." />
      </div>
    );
  }

  const canAct = hasOwner && !protectedOwner;
  const res = (action, extra = {}) => ({ id: reportId, action, ...extra });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {status === "in_review" ? (
          <QuickAction label="Release" icon={Hand} action={assignReportAction} args={{ id: reportId, assign: false }} />
        ) : (
          <QuickAction label="Take this report" icon={Flag} action={assignReportAction} args={{ id: reportId, assign: true }} />
        )}
        <ActionDialog
          label="Add note" icon={NotebookPen} title="Add an internal note" description="Only staff can see notes. The member is never told."
          action={addReportNoteAction} args={{ id: reportId }} reasonField="note" reasonLabel="Note" confirmLabel="Save note"
        />
      </div>
      {status === "in_review" && assignee && <p className="text-muted-foreground text-xs">Being reviewed by {assignee}.</p>}

      <hr />
      <p className="eyebrow">Decision</p>
      <div className="grid gap-2">
        <ActionDialog
          label="No action — dismiss" icon={CircleSlash} title="Dismiss this report"
          description="Use when the content does not break the guidelines. The reporter is told it was reviewed."
          action={resolveReportAction} args={res("dismiss")} reasonRequired={false} reasonLabel="Internal reason"
        />
        {canAct && can.warn && (
          <ActionDialog
            label="Send a warning" icon={Gavel} title="Warn the member"
            description="They receive a notification with your reason. Nothing is removed."
            action={resolveReportAction} args={res("warn")} reasonLabel="Reason shown to the member"
          />
        )}
        {canAct && can.remove && (targetType === "post" || targetType === "comment") && !contentRemoved && (
          <ActionDialog
            label="Remove content" icon={Trash2} destructive title="Remove this content"
            description="It disappears for everyone but its author, who is told why and may appeal."
            action={resolveReportAction} args={res("remove_content")} reasonLabel="Reason shown to the member"
          />
        )}
        {canAct && can.restrict && (
          <ActionDialog
            label="Restrict account" icon={UserCheck} destructive title="Restrict this account"
            description="They can still sign in and read, but their profile is hidden and they cannot post or message."
            action={resolveReportAction} args={res("restrict")} reasonLabel="Reason shown to the member"
          />
        )}
        {canAct && can.suspend && (
          <ActionDialog
            label="Suspend account" icon={Ban} destructive title="Suspend this account"
            description="They are signed out of the app and can only read the decision and appeal it."
            action={resolveReportAction} args={res("suspend")} reasonLabel="Reason shown to the member"
          />
        )}
      </div>
      {!canAct && hasOwner && protectedOwner && <p className="text-muted-foreground text-xs">This member holds an administrator role. Only a global administrator can act on them.</p>}
      {!hasOwner && <p className="text-muted-foreground text-xs">The account no longer exists, so only &ldquo;dismiss&rdquo; is possible.</p>}
    </div>
  );
}
