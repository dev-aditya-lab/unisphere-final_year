"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { deleteCommunityAction } from "@/lib/actions/campus";

/** Owner only. Deleting hides the community from everyone; type its address to confirm. */
export function DangerZone({ community }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <section className="rounded-xl border border-destructive/40 p-4" aria-labelledby="danger-title">
      <h3 id="danger-title" className="text-destructive-text text-sm font-bold">Delete this community</h3>
      <p className="text-muted-foreground mt-1 text-sm">The community, its channels and its member list disappear for everyone. Posts made there stay with their authors but lose the community. To hand the community to someone else instead, use Members → Make owner.</p>
      <Button variant="destructive" size="sm" className="mt-3" onClick={() => setOpen(true)}>Delete community…</Button>
      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {community.name}?</DialogTitle>
            <DialogDescription>Type <strong className="font-mono">{community.slug}</strong> to confirm.</DialogDescription>
          </DialogHeader>
          <Input value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="Type the community address to confirm" autoComplete="off" />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>Keep it</Button>
            <Button
              variant="destructive"
              disabled={pending || typed !== community.slug}
              onClick={() => startTransition(async () => {
                const res = await deleteCommunityAction(community.id);
                if (res.ok) { toast.success("Community deleted"); router.push("/communities"); router.refresh(); } else toast.error(res.error);
              })}
            >
              {pending ? "Deleting…" : "Delete forever"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
