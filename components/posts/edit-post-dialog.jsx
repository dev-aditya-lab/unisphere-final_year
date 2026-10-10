"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  const isRepost = Boolean(post.repost_of_id);

  function save() {
    setError(null);
    setFieldErrors({});
    startTransition(async () => {
      const res = await updatePostAction({ postId: post.id, category, title, body, visibility });
      if (res.ok) {
        toast.success("Post updated");
        onOpenChange(false);
        router.refresh();
      } else {
        setError(res.error);
        setFieldErrors(res.fieldErrors ?? {});
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit post</DialogTitle>
          <DialogDescription>Edited posts show an “edited” label.</DialogDescription>
        </DialogHeader>
        {error && <FormAlert>{error}</FormAlert>}
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
            <Textarea id="edit-body" rows={8} value={body} maxLength={10000} onChange={(e) => setBody(e.target.value)} aria-describedby="edit-body-desc" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={pending || !body.trim()}>
            {pending ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
