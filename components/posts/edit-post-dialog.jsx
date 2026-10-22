"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MarkdownEditor } from "@/components/posts/markdown-editor";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/forms/field";
import { FormAlert } from "@/components/forms/form-alert";
import { updatePostAction } from "@/lib/actions/posts";
import { POST_CATEGORIES, POST_VISIBILITY } from "@/lib/content/post-meta";

export function EditPostDialog({ open, onOpenChange, post }) {
  const router = useRouter();
  const [title, setTitle] = useState(post.title ?? "");
  const [body, setBody] = useState(post.body ?? "");
  const [category, setCategory] = useState(post.category);
  const [visibility, setVisibility] = useState(post.visibility);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [pending, startTransition] = useTransition();
  // What this editor started from. Saves are only applied if the post still has these values (see updatePost).
  const [base, setBase] = useState({ category: post.category, title: post.title ?? null, body: post.body ?? "", visibility: post.visibility });
  // Set when the post was changed somewhere else: the server's current version, shown next to what you typed.
  const [conflict, setConflict] = useState(null);
  const isRepost = Boolean(post.repost_of_id);

  function save({ overwrite = false } = {}) {
    setError(null);
    setFieldErrors({});
    startTransition(async () => {
      let res;
      try {
        res = await updatePostAction({ postId: post.id, category, title, body, visibility, ...(overwrite ? {} : { base }) });
      } catch {
        setError("We could not reach UniSphere. Your changes are still here: check your connection and try again.");
        return;
      }
      if (res.ok) {
        toast.success("Post updated");
        setConflict(null);
        onOpenChange(false);
        router.refresh();
      } else if (res.code === "conflict" && res.current) {
        setConflict(res.current);
      } else {
        setError(res.error);
        setFieldErrors(res.fieldErrors ?? {});
      }
    });
  }

  function loadLatest() {
    if (!conflict) return;
    setCategory(conflict.category);
    setTitle(conflict.title ?? "");
    setBody(conflict.body ?? "");
    setVisibility(conflict.visibility);
    setBase(conflict);
    setConflict(null);
  }

  function keepMine() {
    // Your text stays; the editor now starts from the latest version, so the next save is checked against it.
    setBase(conflict);
    setConflict(null);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit post</DialogTitle>
          <DialogDescription>Edited posts show an “edited” label.</DialogDescription>
        </DialogHeader>
        {error && <FormAlert>{error}</FormAlert>}
        {conflict && (
          <div role="alert" className="border-warning bg-warning-soft text-warning-text space-y-3 rounded-lg border p-3 text-sm">
            <p className="font-semibold">This post was changed somewhere else while you were editing it.</p>
            <p>Your changes have not been saved and are still in the form. Choose how to continue:</p>
            <div className="bg-background/70 text-foreground max-h-32 overflow-auto rounded-md p-2 text-xs whitespace-pre-wrap">
              {conflict.title ? <strong className="block">{conflict.title}</strong> : null}
              {conflict.body}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={loadLatest}>
                Load the latest version
              </Button>
              <Button type="button" size="sm" onClick={keepMine}>
                Keep my changes
              </Button>
            </div>
          </div>
        )}
        <div className="space-y-4">
          {!isRepost && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field id="edit-category" label="Type">
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger id="edit-category" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {POST_CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field id="edit-visibility" label="Who can see it">
                <Select value={visibility} onValueChange={setVisibility}>
                  <SelectTrigger id="edit-visibility" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {POST_VISIBILITY.map((v) => (
                      <SelectItem key={v.value} value={v.value}>
                        {v.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          )}
          <Field id="edit-title" label="Title" optional error={fieldErrors.title}>
            <Input id="edit-title" value={title} maxLength={140} onChange={(e) => setTitle(e.target.value)} aria-describedby="edit-title-desc" />
          </Field>
          <Field id="edit-body" label="Post" error={fieldErrors.body}>
            <MarkdownEditor id="edit-body" rows={8} value={body} maxLength={10000} onChange={setBody} aria-describedby="edit-body-desc" previewClassName="text-[15px] leading-[1.65]" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => save()} disabled={pending || !body.trim() || Boolean(conflict)}>
            {pending ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
