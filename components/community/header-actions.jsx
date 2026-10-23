"use client";

import { useState, useTransition } from "react";
import { Bell, BellOff, Flag } from "lucide-react";
import { toast } from "sonner";
import { ActionMenu } from "@/components/community/action-menu";
import { ReportDialog } from "@/components/posts/report-dialog";
import { Button } from "@/components/ui/button";
import { setNotifyPrefAction } from "@/lib/actions/community-workspace";
import { MUTE_OPTIONS, NOTIFY_LEVELS } from "@/lib/community/rules";

/** Community-wide notification setting (a channel's own setting beats it, an unexpired mute beats both). */
export function CommunityNotifyMenu({ communityId, muted }) {
  const [pending, startTransition] = useTransition();
  const [off, setOff] = useState(Boolean(muted));
  const apply = (level, muteHours, done) =>
    startTransition(async () => {
      const res = await setNotifyPrefAction({ communityId, level, muteHours });
      if (res.ok) { setOff(level === "none"); toast.success(done); } else toast.error(res.error);
    });
  const items = [
    ...NOTIFY_LEVELS.map((l) => ({ id: l.value, label: l.label, onSelect: () => apply(l.value, null, `Community notifications: ${l.label.toLowerCase()}`) })),
    ...MUTE_OPTIONS.map((o, i) => ({ id: `m${o.hours}`, label: `Mute ${o.label.toLowerCase()}`, onSelect: () => apply("none", o.hours, `Muted ${o.label.toLowerCase()}`), separatorBefore: i === 0 })),
  ];
  return (
    <ActionMenu
      title="Notifications for this community"
      description="Applies to every channel unless a channel has its own setting. A mute always wins."
      items={items}
      trigger={<Button variant="outline" size="sm" disabled={pending}>{off ? <BellOff /> : <Bell />} Notifications</Button>}
    />
  );
}

/** "Report this community" for the platform team (a problem with one message goes to the community's own moderators instead). */
export function ReportCommunityButton({ communityId }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}><Flag /> Report</Button>
      <ReportDialog open={open} onOpenChange={setOpen} targetType="community" targetId={communityId} />
    </>
  );
}
