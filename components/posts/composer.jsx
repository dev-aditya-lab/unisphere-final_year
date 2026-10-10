"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserAvatar } from "@/components/user-avatar";
import { FormAlert } from "@/components/forms/form-alert";
import { AssistPanel } from "@/components/ai/assist-panel";
import { CategoryBadge } from "@/components/posts/category-badge";
import { createPostAction } from "@/lib/actions/posts";
import { POST_CATEGORIES, POST_VISIBILITY, COMMUNITY_POST_VISIBILITY, CATEGORY_BY_VALUE } from "@/lib/content/post-meta";
import { uploadFileWithProgress } from "@/lib/storage/client";
import { privateFileUrl } from "@/lib/media";
import { cn } from "@/lib/utils";

const MAX = 10000;

/**
 * Post composer. `defaultCategory` lets pages like /ideas pre-select a type.
 * `ai` describes which AI helpers may be offered (see getAiUiState); they only ever propose text,
 * and the member approves any change.
 */
export function Composer({ profile, defaultCategory = "general", defaultVisibility = "college", lockCategory = false, ai = null, onCreated, autoFocus = false, community = null }) {
  const router = useRouter();
  const fileInput = useRef(null);
  const [category, setCategory] = useState(defaultCategory);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState(community ? "community" : defaultVisibility);
  const [attachments, setAttachments] = useState([]); // { id, name }
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [pending, startTransition] = useTransition();
  const [focused, setFocused] = useState(autoFocus);

  const meta = CATEGORY_BY_VALUE[category];
  const showTitle = meta.titleRequired || title.length > 0 || category === "questions";
  const expanded = focused || body.length > 0 || attachments.length > 0;

  async function onPickFiles(e) {
    const files = Array.from(e.target.files ?? []).slice(0, 4 - attachments.length);
    e.target.value = "";
    for (const file of files) {
      setUploading((n) => n + 1);
      const res = await uploadFileWithProgress(file, "post_attachment");
      setUploading((n) => n - 1);
      if (res.ok) setAttachments((prev) => [...prev, { id: res.fileId, name: file.name }]);
      else toast.error(res.error ?? "Upload failed");
    }
  }

  function submit(e) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    startTransition(async () => {
      const res = await createPostAction({ category, title, body, visibility, communityId: community?.id ?? null, attachmentIds: attachments.map((a) => a.id) });
      if (res.ok) {
        toast.success("Posted");
        setTitle("");
        setBody("");
        setAttachments([]);
        setFocused(false);
        if (!lockCategory) setCategory(defaultCategory);
        onCreated?.(res);
        router.refresh();
      } else {
        setError(res.error);
        setFieldErrors(res.fieldErrors ?? {});
      }
    });
  }

  return (
    <form onSubmit={submit} className="surface p-4 sm:p-5" aria-label="Create a post">
      <div className="flex gap-3">
        <UserAvatar name={profile.full_name} avatarKey={profile.avatar_key} size="md" className="mt-0.5 hidden sm:flex" />
        <div className="min-w-0 flex-1 space-y-3">
          {error && <FormAlert>{error}</FormAlert>}

          {showTitle && (
            <div>
              <label htmlFor="composer-title" className="sr-only">
                Title
              </label>
              <Input
                id="composer-title"
                value={title}
                maxLength={140}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={category === "ideas" ? "Name your idea" : category === "projects" ? "Project name" : "Title"}
                aria-invalid={Boolean(fieldErrors.title)}
                aria-describedby={fieldErrors.title ? "composer-title-error" : undefined}
                className="font-heading text-base font-semibold"
              />
              {fieldErrors.title && (
                <p id="composer-title-error" role="alert" className="text-destructive mt-1 text-xs font-medium">
                  {fieldErrors.title}
                </p>
              )}
            </div>
          )}

          <div>
            <label htmlFor="composer-body" className="sr-only">
              Post text
            </label>
            <Textarea
              id="composer-body"
              value={body}
              maxLength={MAX}
              rows={expanded ? 5 : 2}
              onFocus={() => setFocused(true)}
              onChange={(e) => setBody(e.target.value)}
              placeholder={meta.hint ?? "What are you working on?"}
              aria-invalid={Boolean(fieldErrors.body)}
              aria-describedby={fieldErrors.body ? "composer-body-error" : "composer-hint"}
              className="resize-y"
            />
            {fieldErrors.body ? (
              <p id="composer-body-error" role="alert" className="text-destructive mt-1 text-xs font-medium">
                {fieldErrors.body}
              </p>
            ) : (
              <p id="composer-hint" className="text-muted-foreground mt-1 text-xs">
                Use #hashtags to be found and @username to mention someone.
              </p>
            )}
          </div>

          {attachments.length > 0 && (
            <ul className="grid grid-cols-4 gap-2" aria-label="Attached images">
              {attachments.map((a) => (
                <li key={a.id} className="bg-muted relative aspect-square overflow-hidden rounded-md border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={privateFileUrl(a.id)} alt={a.name} className="size-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setAttachments((prev) => prev.filter((x) => x.id !== a.id))}
                    aria-label={`Remove ${a.name}`}
                    className="absolute top-1 right-1 flex size-6 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
                  >
                    <X className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {expanded && <AssistPanel ai={ai} category={category} title={title} body={body} setTitle={setTitle} setBody={setBody} setCategory={setCategory} />}

          {expanded && (
            <div className="flex flex-wrap items-center gap-2 border-t pt-3">
              {!lockCategory && (
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger size="sm" className="w-auto min-w-32" aria-label="Post type">
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
              )}
              {lockCategory && <CategoryBadge category={category} />}

              <Select value={visibility} onValueChange={setVisibility}>
                <SelectTrigger size="sm" className="w-auto min-w-32" aria-label="Who can see this post">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(community ? COMMUNITY_POST_VISIBILITY.filter((v) => v.value === "community" || community.visibility === "public") : POST_VISIBILITY).map((v) => (
                    <SelectItem key={v.value} value={v.value}>
                      {v.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={onPickFiles} aria-label="Attach images" />
              <Button type="button" variant="ghost" size="sm" disabled={attachments.length >= 4 || uploading > 0} onClick={() => fileInput.current?.click()}>
                {uploading > 0 ? <Loader2 className="animate-spin" /> : <ImagePlus />}
                <span className="hidden sm:inline">{uploading > 0 ? "Uploading…" : "Add images"}</span>
                <span className="sr-only sm:hidden">Add images</span>
              </Button>

              <span className={cn("text-muted-foreground ml-auto text-xs tabular-nums", body.length > MAX - 200 && "text-warning-text")}>
                {body.length.toLocaleString()} / {MAX.toLocaleString()}
              </span>
              <Button type="submit" size="sm" disabled={pending || uploading > 0 || !body.trim()}>
                {pending ? "Posting…" : "Post"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </form>
  );
}
