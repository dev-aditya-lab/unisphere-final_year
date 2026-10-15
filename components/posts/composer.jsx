"use client";

import { useEffect, useRef, useState, useTransition } from "react";
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
import { useImageEditor } from "@/components/images/use-image-editor";
import { privateFileUrl } from "@/lib/media";
import { createOpTracker } from "@/lib/client/op-id";
import { emitPostCreated } from "@/lib/client/feed-events";
import { clearDraft, readDraft, writeDraft } from "@/lib/client/drafts";
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
  const bodyRef = useRef(null);
  const [category, setCategory] = useState(defaultCategory);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const hasCollege = Boolean(profile.college_id);
  const [visibility, setVisibility] = useState(community ? "community" : defaultVisibility === "college" && !hasCollege ? "public" : defaultVisibility);
  const [attachments, setAttachments] = useState([]); // { id, name }
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [pending, startTransition] = useTransition();
  const [focused, setFocused] = useState(autoFocus);
  const [op] = useState(createOpTracker);
  const draftKey = `post:${profile.id}:${community?.id ?? "feed"}`;

  // Restore an unsent draft once, after hydration (so the server and first client render still match).
  useEffect(() => {
    const t = setTimeout(() => {
      const d = readDraft(draftKey);
      if (!d || typeof d.body !== "string" || !d.body) return;
      setBody(d.body);
      if (typeof d.title === "string") setTitle(d.title);
      if (!lockCategory && CATEGORY_BY_VALUE[d.category]) setCategory(d.category);
      setFocused(true);
    }, 0);
    return () => clearTimeout(t);
  }, [draftKey, lockCategory]);

  // Keep the draft up to date while typing (debounced, local only).
  useEffect(() => {
    const t = setTimeout(() => {
      if (body.trim() || title.trim()) writeDraft(draftKey, { body, title, category });
      else clearDraft(draftKey);
    }, 500);
    return () => clearTimeout(t);
  }, [body, title, category, draftKey]);

  const meta = CATEGORY_BY_VALUE[category];
  const { editImages, imageEditor } = useImageEditor();

  // The "write a post" buttons link to /feed#compose: open and focus the composer when that hash is present.
  useEffect(() => {
    if (community) return;
    const focusIfRequested = () => {
      if (window.location.hash !== "#compose") return;
      setFocused(true);
      requestAnimationFrame(() => bodyRef.current?.focus({ preventScroll: false }));
    };
    focusIfRequested();
    window.addEventListener("hashchange", focusIfRequested);
    return () => window.removeEventListener("hashchange", focusIfRequested);
  }, [community]);
  const showTitle = meta.titleRequired || title.length > 0 || category === "questions";
  const expanded = focused || body.length > 0 || attachments.length > 0;

  async function onPickFiles(e) {
    const picked = Array.from(e.target.files ?? []).slice(0, 4 - attachments.length);
    e.target.value = "";
    const files = await editImages(picked);
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
    const attachmentIds = attachments.map((a) => a.id);
    // The same content keeps the same key, so pressing "Post" again after a lost response cannot publish it twice.
    const clientOpId = op.keyFor(JSON.stringify([category, title, body, visibility, community?.id ?? null, attachmentIds]));
    startTransition(async () => {
      let res;
      try {
        res = await createPostAction({ category, title, body, visibility, communityId: community?.id ?? null, attachmentIds, clientOpId });
      } catch {
        // The request never got an answer. Nothing is cleared: the text is still here, and posting again is safe.
        setError("We could not reach UniSphere. Your post has not been lost: check your connection and press Post again.");
        return;
      }
      if (res.ok) {
        toast.success("Posted");
        const created = {
          id: res.id,
          slug: res.slug,
          category: res.category,
          title: title.trim() ? title.trim() : null,
          body: body.trim(),
          visibility,
          status: "published",
          author_id: profile.id,
          college_id: profile.college_id ?? null,
          community_id: community?.id ?? null,
          author_name: profile.full_name,
          author_username: profile.username,
          author_avatar_key: profile.avatar_key ?? null,
          author_account_type: profile.account_type ?? null,
          author_verified: profile.verification_status === "verified",
          author_blue_tick: Boolean(profile.blue_tick),
          created_at: new Date().toISOString(),
          edited_at: null,
          reaction_count: 0,
          comment_count: 0,
          repost_count: 0,
          reactions: {},
          my_reaction: null,
          bookmarked: false,
          attachments: attachments.map((a) => ({ id: a.id, alt: null })),
        };
        setTitle("");
        setBody("");
        setAttachments([]);
        setFocused(false);
        clearDraft(draftKey);
        op.reset();
        if (!lockCategory) setCategory(defaultCategory);
        onCreated?.(res);
        // A feed on this page shows the post at once; anywhere else the page is refreshed to show it.
        if (!emitPostCreated(created)) router.refresh();
      } else {
        setError(res.error);
        setFieldErrors(res.fieldErrors ?? {});
      }
    });
  }

  return (
    <form id={community ? undefined : "compose"} onSubmit={submit} className="surface-raised scroll-mt-20 p-4 sm:p-5" aria-label="Create a post">
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
                <p id="composer-title-error" role="alert" className="text-destructive-text mt-1 text-xs font-medium">
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
              ref={bodyRef}
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
              <p id="composer-body-error" role="alert" className="text-destructive-text mt-1 text-xs font-medium">
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
                  {(community ? COMMUNITY_POST_VISIBILITY.filter((v) => v.value === "community" || community.visibility === "public") : POST_VISIBILITY.filter((v) => hasCollege || v.value !== "college")).map((v) => (
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
              <Button type="submit" variant="hot" size="sm" disabled={pending || uploading > 0 || !body.trim()}>
                {pending ? "Posting…" : "Post"}
              </Button>
            </div>
          )}
        </div>
      </div>
      {imageEditor}
    </form>
  );
}
