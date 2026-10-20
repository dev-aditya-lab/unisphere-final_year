"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Flag, Link2, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
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
import { EditPostDialog } from "@/components/posts/edit-post-dialog";
import { useCopyLink } from "@/components/posts/use-copy-link";
import { deletePostAction } from "@/lib/actions/posts";

/**
 * Mounts a heavy dialog only once it has been opened (and keeps it, so its close animation still plays). A feed of 15
 * posts would otherwise build three dialog trees per post that almost nobody opens.
 */
function MountOnOpen({ open, children }) {
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);
  return mounted ? children : null;
}

/** The overflow menu in a post's header: copy link for everyone, edit and delete for the author, report for others. */
export function PostMenu({ post, viewerId, onDeleted }) {
  const router = useRouter();
  const isOwner = viewerId === post.author_id;
  const { copy } = useCopyLink(post);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function doDelete() {
    setBusy(true);
    const res = await deletePostAction(post.id);
    setBusy(false);
    setDeleteOpen(false);
    if (res.ok) {
      toast.success("Post deleted");
      // A list that owns the post removes it itself; refreshing the whole page as well would re-run every query on it.
      if (onDeleted) onDeleted(post.id);
      else router.refresh();
    } else toast.error(res.error);
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" className="text-muted-foreground -mt-1 -mr-1.5 shrink-0" aria-label="More actions">
            <MoreHorizontal className="size-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onSelect={copy}>
            <Link2 /> Copy link
          </DropdownMenuItem>
          {isOwner && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setEditOpen(true)}>
                <Pencil /> Edit post
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)}>
                <Trash2 /> Delete post
              </DropdownMenuItem>
            </>
          )}
          {viewerId && !isOwner && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setReportOpen(true)}>
                <Flag /> Report post
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <MountOnOpen open={deleteOpen}>
        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this post?</AlertDialogTitle>
              <AlertDialogDescription>It disappears for everyone, including its comments. This cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep it</AlertDialogCancel>
              <AlertDialogAction disabled={busy} className="bg-destructive-text text-background hover:bg-destructive-text/90" onClick={doDelete}>
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </MountOnOpen>

      <MountOnOpen open={reportOpen}>
        <ReportDialog open={reportOpen} onOpenChange={setReportOpen} targetType="post" targetId={post.id} />
      </MountOnOpen>
      {isOwner && (
        <MountOnOpen open={editOpen}>
          <EditPostDialog open={editOpen} onOpenChange={setEditOpen} post={post} />
        </MountOnOpen>
      )}
    </>
  );
}
