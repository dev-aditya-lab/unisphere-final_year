"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AtSign, Globe, GraduationCap, Hash, ImagePlus, Loader2, Lock, RotateCw, Users, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserAvatar } from "@/components/user-avatar";
import { FormAlert } from "@/components/forms/form-alert";
import { AssistPanel } from "@/components/ai/assist-panel";
import { CategoryBadge } from "@/components/posts/category-badge";
import { CategoryIcon } from "@/components/posts/category-icons";
import { SuggestTextarea } from "@/components/posts/suggest-textarea";
import { createPostAction } from "@/lib/actions/posts";
import { ORBITS_CHANGED } from "@/lib/orbits/glance-store";
import { POST_CATEGORIES, POST_VISIBILITY, COMMUNITY_POST_VISIBILITY, CATEGORY_BY_VALUE } from "@/lib/content/post-meta";
import { uploadFileWithProgress } from "@/lib/storage/client";
import { useImageEditor } from "@/components/images/use-image-editor";
import { createOpTracker } from "@/lib/client/op-id";
import { COMPOSE_EVENT, takePendingCompose } from "@/lib/client/compose";
import { emitPostCreated } from "@/lib/client/feed-events";
import { clearDraft, readDraft, writeDraft } from "@/lib/client/drafts";
import { cn } from "@/lib/utils";

const MAX = 10000;
const MAX_IMAGES = 4;
const VISIBILITY_ICON = { public: Globe, college: GraduationCap, connections: Users, private: Lock, community: Users };

/**
 * On a phone the editor fills the screen. The on-screen keyboard shrinks the *visual* viewport but not the layout
 * viewport, so a fixed full-height sheet would slide under the keyboard and hide its own footer. This keeps the sheet
 * exactly as tall as what is actually visible.
 */
function useFitToVisualViewport(active) {
  const [fit, setFit] = useState(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!active || !vv) return;
    const phone = window.matchMedia("(max-width: 639px)");
    const update = () => setFit(phone.matches ? { top: vv.offsetTop, height: vv.height, bottom: "auto" } : null);
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    phone.addEventListener("change", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      phone.removeEventListener("change", update);
      setFit(null);
    };
  }, [active]);
  return fit ?? undefined;
}

function UploadTile({ item, onRemove, onRetry }) {
  const failed = item.status === "error";
  const busy = item.status === "uploading";
  return (
    <li className="bg-muted relative aspect-[4/3] overflow-hidden rounded-xl border sm:aspect-square">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={item.preview} alt={item.name} className={cn("size-full object-cover transition-opacity", (busy || failed) && "opacity-50")} />
      {busy && (
        <div className="absolute inset-x-2 bottom-2">
          <div role="progressbar" aria-label={`Uploading ${item.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={item.progress} className="h-1.5 overflow-hidden rounded-full bg-black/30">
            <div className="bg-primary h-full rounded-full transition-[width] duration-150" style={{ width: `${Math.max(item.progress, 4)}%` }} />
          </div>
        </div>
      )}
      {failed && (
        <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 p-2 text-center">
          <p className="bg-card/95 text-destructive-text line-clamp-2 rounded-md px-1.5 py-0.5 text-[11px] font-semibold">{item.error}</p>
          <Button type="button" size="xs" variant="outline" onClick={() => onRetry(item.key)}>
            <RotateCw /> Retry
          </Button>
        </div>
      )}
      <button
        type="button"
        onClick={() => onRemove(item.key)}
        aria-label={`Remove ${item.name}`}
        className="absolute top-1.5 right-1.5 grid size-8 place-items-center rounded-full bg-black/60 text-white transition-colors outline-none hover:bg-black/80 focus-visible:ring-[3px] focus-visible:ring-white/70"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </li>
  );
}

/**
 * Post composer: a compact prompt on the page that opens a full editor (a dialog on desktop, the whole screen on a
 * phone). `defaultCategory` lets pages like /ideas pre-select a type.
 * `ai` describes which AI helpers may be offered (see getAiUiState); they only ever propose text,
 * and the member approves any change.
 *
 * What the member has written lives here, not in the dialog, so closing the editor never loses it, and it is also kept
 * on the device as a draft. Nothing is cleared until the server has accepted the post.
 */
export function Composer({ profile, defaultCategory = "general", defaultVisibility = "public", lockCategory = false, ai = null, onCreated, autoFocus = false, community = null }) {
  const router = useRouter();
  const fileInput = useRef(null);
  const bodyRef = useRef(null);
  const titleRef = useRef(null);
  const suggestOpen = useRef(false);
  const [open, setOpen] = useState(autoFocus);
  const [category, setCategory] = useState(defaultCategory);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const hasCollege = Boolean(profile.college_id);
  const [visibility, setVisibility] = useState(community ? "community" : defaultVisibility);
  const [uploads, setUploads] = useState([]); // { key, name, file, preview, status, progress, id, error }
  const uploadsRef = useRef(uploads);
  const aborts = useRef(new Map());
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [pending, startTransition] = useTransition();
  const [op] = useState(createOpTracker);
  const draftKey = `post:${profile.id}:${community?.id ?? "feed"}`;
  const fit = useFitToVisualViewport(open);

  const visibilityOptions = useMemo(
    () =>
      community
        ? COMMUNITY_POST_VISIBILITY.filter((v) => v.value === "community" || community.visibility === "public")
        : POST_VISIBILITY.filter((v) => hasCollege || v.value !== "college"),
    [community, hasCollege],
  );

  const meta = CATEGORY_BY_VALUE[category];
  const { editImages, imageEditor } = useImageEditor();
  const showTitle = meta.titleRequired || title.length > 0 || category === "questions";
  const uploading = uploads.some((u) => u.status === "uploading");
  const failedUploads = uploads.filter((u) => u.status === "error").length;
  const hasContent = body.trim().length > 0 || title.trim().length > 0 || uploads.length > 0;
  const hasDraft = body.length > 0 || title.length > 0;

  // Restore an unsent draft once, after hydration (so the server and first client render still match).
  useEffect(() => {
    const t = setTimeout(() => {
      const d = readDraft(draftKey);
      if (!d || typeof d.body !== "string" || !d.body) return;
      setBody(d.body);
      if (typeof d.title === "string") setTitle(d.title);
      if (!lockCategory && CATEGORY_BY_VALUE[d.category]) setCategory(d.category);
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

  // The "write a post" buttons ask for the editor (lib/client/compose.js) or link to /feed#compose: open it for either.
  // Only the general composer answers, not one for a community or a fixed post type, which are for their own page.
  useEffect(() => {
    if (community || lockCategory) return;
    const openIfRequested = () => {
      if (window.location.hash === "#compose" || takePendingCompose()) setOpen(true);
    };
    const onRequest = (e) => {
      e.preventDefault(); // tells the button it was handled
      setOpen(true);
    };
    openIfRequested();
    window.addEventListener("hashchange", openIfRequested);
    window.addEventListener(COMPOSE_EVENT, onRequest);
    return () => {
      window.removeEventListener("hashchange", openIfRequested);
      window.removeEventListener(COMPOSE_EVENT, onRequest);
    };
  }, [community, lockCategory]);

  useEffect(() => {
    uploadsRef.current = uploads;
  }, [uploads]);
  // Previews are object URLs: release them (and stop transfers) when the composer goes away.
  useEffect(() => {
    const controllers = aborts.current;
    return () => {
      controllers.forEach((c) => c.abort());
      uploadsRef.current.forEach((u) => URL.revokeObjectURL(u.preview));
    };
  }, []);

  const openEditor = useCallback(() => setOpen(true), []);
  const closeEditor = useCallback(() => {
    setOpen(false);
    // Leave no "#compose" behind, so the next "write a post" link click is a change and opens the editor again.
    if (window.location.hash === "#compose") window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }, []);

  const patchUpload = useCallback((key, patch) => setUploads((prev) => prev.map((u) => (u.key === key ? { ...u, ...patch } : u))), []);

  const uploadOne = useCallback(
    async (item) => {
      const controller = new AbortController();
      aborts.current.set(item.key, controller);
      patchUpload(item.key, { status: "uploading", progress: 0, error: null });
      const res = await uploadFileWithProgress(item.file, "post_attachment", (progress) => patchUpload(item.key, { progress }), { signal: controller.signal });
      aborts.current.delete(item.key);
      if (res.aborted) return;
      if (res.ok) patchUpload(item.key, { status: "done", progress: 100, id: res.fileId });
      else patchUpload(item.key, { status: "error", error: res.error ?? "Upload failed" });
    },
    [patchUpload],
  );

  async function onPickFiles(e) {
    const room = MAX_IMAGES - uploadsRef.current.length;
    const all = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (all.length === 0) return;
    if (room <= 0) return toast.error(`You can attach up to ${MAX_IMAGES} images.`);
    if (all.length > room) toast.message(`Only ${room} more image${room === 1 ? "" : "s"} fit in this post.`);
    setOpen(true);
    const edited = await editImages(all.slice(0, room));
    const fresh = edited.slice(0, Math.max(0, MAX_IMAGES - uploadsRef.current.length)).map((file) => ({
      key: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      name: file.name,
      file,
      preview: URL.createObjectURL(file),
      status: "uploading",
      progress: 0,
      id: null,
      error: null,
    }));
    if (fresh.length === 0) return;
    setUploads((prev) => [...prev, ...fresh]);
    fresh.forEach(uploadOne);
  }

  function removeUpload(key) {
    aborts.current.get(key)?.abort();
    aborts.current.delete(key);
    const item = uploadsRef.current.find((u) => u.key === key);
    if (item) URL.revokeObjectURL(item.preview);
    setUploads((prev) => prev.filter((u) => u.key !== key));
  }

  function retryUpload(key) {
    const item = uploadsRef.current.find((u) => u.key === key);
    if (item) uploadOne(item);
  }

  function resetAll() {
    uploadsRef.current.forEach((u) => URL.revokeObjectURL(u.preview));
    setTitle("");
    setBody("");
    setUploads([]);
    setError(null);
    setFieldErrors({});
    clearDraft(draftKey);
    op.reset();
    if (!lockCategory) setCategory(defaultCategory);
  }

  function submit(e) {
    e?.preventDefault();
    if (pending) return; // a second press while the first is in flight must not post twice
    setError(null);
    const errors = {};
    if (!body.trim()) errors.body = "Write something first";
    if (meta.titleRequired && title.trim().length < 3) errors.title = "Add a short title for this type of post";
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setOpen(true);
      return;
    }
    if (uploading) {
      setError("Your images are still uploading. You can post as soon as they finish.");
      setOpen(true);
      return;
    }
    if (failedUploads > 0) {
      setError("Retry or remove the image that did not upload, then post.");
      setOpen(true);
      return;
    }
    setFieldErrors({});
    const attachments = uploads.filter((u) => u.status === "done");
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
        setOpen(true);
        return;
      }
      if (res.ok) {
        toast.success("Posted");
        window.dispatchEvent(new Event(ORBITS_CHANGED)); // a post can earn Orbits: let the header ask the server again
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
        resetAll();
        closeEditor();
        onCreated?.(res);
        // A feed on this page shows the post at once; anywhere else the page is refreshed to show it.
        if (!emitPostCreated(created)) router.refresh();
      } else {
        setError(res.error);
        setFieldErrors(res.fieldErrors ?? {});
        setOpen(true);
      }
    });
  }

  const firstLine = body.split("\n", 1)[0];
  const placeholder = "Share something with your community…";
  const remaining = MAX - body.length;
  const nearLimit = remaining <= 500;

  return (
    <section id={community ? undefined : "compose"} aria-label="Create a post" className="bg-card scroll-mt-20 rounded-2xl border p-3 shadow-card sm:p-4">
      {/* Compact prompt: a real input that opens the full editor. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 sm:flex-nowrap">
        <UserAvatar name={profile.full_name} avatarKey={profile.avatar_key} size="md" className="shrink-0 max-sm:hidden" />
        <input
          type="text"
          aria-label="Start a post"
          aria-haspopup="dialog"
          value={firstLine}
          placeholder={placeholder}
          enterKeyHint="go"
          autoComplete="off"
          onChange={(e) => setBody((prev) => e.target.value + prev.slice(prev.split("\n", 1)[0].length))}
          onClick={openEditor}
          onKeyDown={(e) => {
            if (e.key === "Enter" || (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey)) openEditor();
          }}
          className="bg-muted placeholder:text-faint hover:bg-accent focus-visible:ring-ring/40 h-11 min-w-0 flex-1 cursor-text rounded-full border border-transparent px-4 text-sm outline-none focus-visible:ring-[3px]"
        />
        <div className="flex w-full items-center gap-1 sm:w-auto">
          <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={() => fileInput.current?.click()} disabled={uploads.length >= MAX_IMAGES}>
            <ImagePlus />
            Add images
          </Button>
          <Button type="button" size="sm" className="ml-auto sm:ml-0" disabled={pending} onClick={() => (hasContent ? submit() : openEditor())}>
            {pending ? <Loader2 className="animate-spin" /> : null}
            {pending ? "Posting…" : "Post"}
          </Button>
        </div>
      </div>
      {hasDraft && !open && (
        <p className="text-muted-foreground mt-2.5 flex items-center gap-2 border-t pt-2.5 text-xs">
          <span>Draft saved on this device.</span>
          <button type="button" onClick={openEditor} className="text-primary-text rounded font-semibold hover:underline">
            Continue
          </button>
          <button type="button" onClick={resetAll} className="text-muted-foreground hover:text-foreground rounded font-medium hover:underline">
            Discard
          </button>
        </p>
      )}
      <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" tabIndex={-1} onChange={onPickFiles} aria-label="Attach images" />

      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : !pending && closeEditor())}>
        <DialogContent
          showCloseButton={false}
          style={fit}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            const target = showTitle && !title && meta.titleRequired ? titleRef.current : bodyRef.current;
            target?.focus();
          }}
          onEscapeKeyDown={(e) => {
            // Escape closes an open suggestion list first; only a second press leaves the editor.
            if (suggestOpen.current) e.preventDefault();
          }}
          onInteractOutside={(e) => {
            // A stray tap outside must not close an editor that has work in it.
            if (hasContent || pending) e.preventDefault();
          }}
          className="flex flex-col gap-0 overflow-hidden p-0 max-sm:inset-0 max-sm:h-dvh max-sm:max-h-none max-sm:rounded-none max-sm:overflow-hidden max-sm:border-0 max-sm:p-0 sm:max-h-[min(90dvh,46rem)] sm:max-w-2xl sm:p-0"
        >
          <form onSubmit={submit} aria-label="Create a post" className="flex min-h-0 flex-1 flex-col">
            <div className="pt-safe shrink-0 border-b">
              <header className="flex items-center gap-2 px-3 py-2.5 sm:px-4">
                <Button type="button" variant="ghost" size="icon-sm" onClick={closeEditor} aria-label="Close editor" disabled={pending}>
                  <X />
                </Button>
                <div className="min-w-0 flex-1">
                  <DialogTitle className="text-base">Create post</DialogTitle>
                  <DialogDescription className="text-muted-foreground text-xs">Your draft is saved on this device as you type.</DialogDescription>
                </div>
              </header>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-4">
              {error && <FormAlert>{error}</FormAlert>}

              <div className="flex items-center gap-3">
                <UserAvatar name={profile.full_name} avatarKey={profile.avatar_key} size="md" className="shrink-0" />
                <div className="min-w-0 leading-tight">
                  <p className="truncate text-sm font-semibold">{profile.full_name}</p>
                  <Select value={visibility} onValueChange={setVisibility}>
                    <SelectTrigger size="sm" aria-label="Who can see this post" className="bg-muted hover:bg-accent mt-1 h-7 gap-1.5 rounded-full border-transparent px-2.5 py-0 text-xs font-medium shadow-none">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {visibilityOptions.map((v) => {
                        const Icon = VISIBILITY_ICON[v.value] ?? Globe;
                        return (
                          <SelectItem key={v.value} value={v.value}>
                            <Icon /> {v.label}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {lockCategory ? (
                <CategoryBadge category={category} />
              ) : (
                <div role="group" aria-label="Post type" className="scrollbar-none -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5">
                  {POST_CATEGORIES.map((c) => {
                    const selected = category === c.value;
                    return (
                      <button
                        key={c.value}
                        type="button"
                        onClick={() => setCategory(c.value)}
                        aria-pressed={selected}
                        className={cn(
                          "focus-visible:ring-ring/40 flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold whitespace-nowrap transition-colors outline-none focus-visible:ring-[3px]",
                          selected ? "border-primary/30 bg-primary-soft text-primary-text" : "text-muted-foreground hover:bg-accent hover:text-foreground",
                        )}
                      >
                        <CategoryIcon value={c.value} className="size-3.5" aria-hidden="true" />
                        {c.label}
                      </button>
                    );
                  })}
                </div>
              )}

              {showTitle && (
                <div>
                  <label htmlFor="composer-title" className="sr-only">
                    Title
                  </label>
                  <Input
                    id="composer-title"
                    ref={titleRef}
                    value={title}
                    maxLength={140}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={category === "ideas" ? "Name your idea" : category === "projects" ? "Project name" : "Title"}
                    aria-invalid={Boolean(fieldErrors.title)}
                    aria-describedby={fieldErrors.title ? "composer-title-error" : undefined}
                    className="font-heading h-11 border-0 bg-transparent px-0 text-lg font-bold shadow-none placeholder:font-semibold focus-visible:ring-0"
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
                <SuggestTextarea
                  id="composer-body"
                  ref={bodyRef}
                  value={body}
                  onChange={setBody}
                  onSuggestOpenChange={(isOpen) => {
                    suggestOpen.current = isOpen;
                  }}
                  maxLength={MAX}
                  rows={6}
                  placeholder={meta.hint ?? "What are you working on?"}
                  aria-invalid={Boolean(fieldErrors.body)}
                  aria-describedby={fieldErrors.body ? "composer-body-error" : "composer-hint"}
                  className="min-h-36 resize-none border-0 bg-transparent px-0 text-base leading-relaxed shadow-none focus-visible:ring-0"
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

              {uploads.length > 0 && (
                <div>
                  <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Attached images">
                    {uploads.map((u) => (
                      <UploadTile key={u.key} item={u} onRemove={removeUpload} onRetry={retryUpload} />
                    ))}
                  </ul>
                  <p className="text-muted-foreground mt-1.5 text-xs" aria-live="polite">
                    {uploading ? "Uploading…" : `${uploads.length} of ${MAX_IMAGES} images`}
                  </p>
                </div>
              )}

              <AssistPanel ai={ai} category={category} title={title} body={body} setTitle={setTitle} setBody={setBody} setCategory={setCategory} />
            </div>

            <div className="pb-safe shrink-0 border-t">
            <footer className="flex items-center gap-1 px-2 py-2 sm:px-3">
              <Button type="button" variant="ghost" size="icon" className="text-muted-foreground" onClick={() => fileInput.current?.click()} disabled={uploads.length >= MAX_IMAGES} aria-label="Add images">
                <ImagePlus />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="text-muted-foreground" onClick={() => bodyRef.current?.insertTrigger("@")} aria-label="Mention someone">
                <AtSign />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="text-muted-foreground" onClick={() => bodyRef.current?.insertTrigger("#")} aria-label="Add a hashtag">
                <Hash />
              </Button>
              <span
                className={cn("text-muted-foreground ml-auto px-2 text-xs tabular-nums max-sm:hidden", nearLimit && "text-warning-text font-semibold max-sm:inline")}
                aria-live={nearLimit ? "polite" : "off"}
              >
                {nearLimit ? `${remaining.toLocaleString()} left` : `${body.length.toLocaleString()} / ${MAX.toLocaleString()}`}
              </span>
              <Button type="submit" className={cn("min-w-20", !nearLimit && "max-sm:ml-auto")} disabled={pending || uploading || !body.trim()}>
                {pending ? <Loader2 className="animate-spin" /> : null}
                {pending ? "Posting…" : "Post"}
              </Button>
            </footer>
            </div>
          </form>
          {imageEditor}
        </DialogContent>
      </Dialog>
    </section>
  );
}
