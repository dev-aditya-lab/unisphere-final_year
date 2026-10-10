"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Clock, Flag, MessageCircle, MoreHorizontal, ShieldBan, UserCheck, UserMinus, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ReportDialog } from "@/components/posts/report-dialog";
import { startConversationAction } from "@/lib/actions/messages";
import {
  blockUserAction,
  cancelRequestAction,
  removeConnectionAction,
  respondToRequestAction,
  sendConnectionRequestAction,
  setFollowAction,
  unblockUserAction,
} from "@/lib/actions/social";

/**
 * Relationship controls on a profile: connect / pending / accept / connected, follow, block, report.
 * `relationship` = { state, requestId, following, blocked } from getRelationship().
 */
export function ConnectControls({ targetId, targetName, relationship, viewerId, loginNext = "/", canMessage = false }) {
  const router = useRouter();
  const [state, setState] = useState(relationship.state);
  const [requestId, setRequestId] = useState(relationship.requestId ?? null);
  const [following, setFollowing] = useState(relationship.following);
  const [blocked, setBlocked] = useState(relationship.blocked);
  const [pending, startTransition] = useTransition();
  const [blockOpen, setBlockOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  if (!viewerId) {
    return (
      <Button asChild>
        <Link href={`/login?next=${encodeURIComponent(loginNext)}`}>
          <UserPlus /> Log in to connect
        </Link>
      </Button>
    );
  }
  if (state === "self") {
    return (
      <Button asChild variant="outline">
        <Link href="/settings/profile">Edit profile</Link>
      </Button>
    );
  }

  function run(action, onOk, successMessage) {
    startTransition(async () => {
      const res = await action();
      if (res.ok) {
        onOk(res);
        if (successMessage) toast.success(successMessage);
        router.refresh();
      } else toast.error(res.error);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {blocked ? (
        <Button variant="outline" disabled={pending} onClick={() => run(() => unblockUserAction(targetId), () => setBlocked(false), "Unblocked")}>
          Unblock
        </Button>
      ) : (
        <>
          {state === "none" && (
            <Button
              disabled={pending}
              onClick={() =>
                run(
                  () => sendConnectionRequestAction({ recipientId: targetId }),
                  (res) => setState(res.status === "connected" ? "connected" : "pending_sent"),
                  "Connection request sent",
                )
              }
            >
              <UserPlus /> Connect
            </Button>
          )}
          {state === "pending_sent" && (
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => (requestId ? run(() => cancelRequestAction(requestId), () => setState("none"), "Request withdrawn") : router.refresh())}
            >
              <Clock /> Requested
            </Button>
          )}
          {state === "pending_received" && (
            <>
              <Button disabled={pending} onClick={() => run(() => respondToRequestAction({ requestId, accept: true }), () => setState("connected"), "You are now connected")}>
                <Check /> Accept
              </Button>
              <Button variant="outline" disabled={pending} onClick={() => run(() => respondToRequestAction({ requestId, accept: false }), () => setState("none"))}>
                <X /> Decline
              </Button>
            </>
          )}
          {state === "connected" && (
            <Button variant="soft" disabled>
              <UserCheck /> Connected
            </Button>
          )}
          {state !== "connected" && (
            <Button
              variant="outline"
              disabled={pending}
              aria-pressed={following}
              onClick={() => run(() => setFollowAction({ targetId, follow: !following }), () => setFollowing(!following))}
            >
              {following ? "Following" : "Follow"}
            </Button>
          )}
        </>
      )}

      {canMessage && !blocked && (
        <Button
          variant="outline"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await startConversationAction(targetId);
              if (res.ok) router.push(`/messages/${res.conversationId}`);
              else toast.error(res.error);
            })
          }
        >
          <MessageCircle /> Message
        </Button>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" aria-label="More options">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {state === "connected" && (
            <>
              <DropdownMenuItem onSelect={() => run(() => removeConnectionAction(targetId), () => setState("none"), "Connection removed")}>
                <UserMinus /> Remove connection
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          {!blocked && (
            <DropdownMenuItem variant="destructive" onSelect={() => setBlockOpen(true)}>
              <ShieldBan /> Block {targetName.split(" ")[0]}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => setReportOpen(true)}>
            <Flag /> Report profile
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={blockOpen} onOpenChange={setBlockOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Block {targetName}?</AlertDialogTitle>
            <AlertDialogDescription>
              You will no longer see each other&rsquo;s profiles or posts, they cannot message you, and any connection or request between you is removed. You can unblock them later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-white"
              onClick={() => run(() => blockUserAction(targetId), () => { setBlocked(true); setState("none"); }, "User blocked")}
            >
              Block
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <ReportDialog open={reportOpen} onOpenChange={setReportOpen} targetType="user" targetId={targetId} />
    </div>
  );
}
