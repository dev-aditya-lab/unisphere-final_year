"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import { ImagePlus, Trash2 } from "@/components/icons/lucide-compat";
import { toast } from "sonner";
import { useImageEditor } from "@/components/images/use-image-editor";
import { MediaImage } from "@/components/media-image";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { discardUploadAction, setBrandingAction } from "@/lib/actions/community-workspace";
import { BRANDING } from "@/lib/community/rules";
import { uploadFileWithProgress } from "@/lib/storage/client";
import { cn } from "@/lib/utils";

const ACCEPT = "image/jpeg,image/png,image/webp";
const SIZES = {
  icon: [{ id: "recommended", label: "Recommended (512 px)", edge: 512 }, { id: "small", label: "Small (256 px)", edge: 256 }],
  banner: [{ id: "recommended", label: "Recommended (1500 × 500)", edge: 1500 }, { id: "small", label: "Smaller (1000 × 333)", edge: 1000 }],
};

/**
 * One picture of the community (its icon or its banner): choose, crop to the right proportions in a preview, upload with progress and
 * cancel, then attach. The crop is only a convenience; the server checks the type from the file's bytes and the proportions from the
 * stored size. If the upload works but attaching it fails, the uploaded file is deleted at once.
 */
function BrandingSlot({ communityId, kind, currentKey, name }) {
  const router = useRouter();
  const spec = BRANDING[kind];
  const input = useRef(null);
  const controller = useRef(null);
  const { editImages, imageEditor } = useImageEditor();
  const [key, setKey] = useState(currentKey);
  const [progress, setProgress] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function onPick(e) {
    const picked = e.target.files?.[0];
    e.target.value = "";
    if (!picked) return;
    setError(null);
    const [file] = await editImages([picked], {
      title: kind === "icon" ? "Crop the community icon" : "Crop the community banner",
      aspect: spec.ratio, lockAspect: true, shape: kind === "icon" ? "round" : "rect", sizes: SIZES[kind], defaultSize: "recommended", maxBytes: 4 * 1024 * 1024,
    });
    if (!file) return;
    controller.current = new AbortController();
    setBusy(true);
    setProgress(0);
    const up = await uploadFileWithProgress(file, "community_image", setProgress, { signal: controller.current.signal });
    if (up.aborted) {
      setBusy(false);
      setProgress(null);
      return;
    }
    if (!up.ok) {
      setError(up.error ?? "The upload failed. Try again.");
      setBusy(false);
      setProgress(null);
      return;
    }
    const res = await setBrandingAction({ communityId, kind, fileId: up.fileId });
    if (res.ok) {
      setKey(up.key); // show the new picture without waiting for the page to reload
      toast.success(`${spec.label} updated`);
      router.refresh();
    } else {
      setError(res.error);
      await discardUploadAction(up.fileId); // nothing uses this upload: remove it now instead of leaving it for the daily sweep
    }
    setBusy(false);
    setProgress(null);
  }

  async function remove() {
    setBusy(true);
    const res = await setBrandingAction({ communityId, kind, fileId: null });
    setBusy(false);
    if (res.ok) {
      setKey(null);
      toast.success(`${spec.label} removed`);
      router.refresh();
    } else setError(res.error);
  }

  return (
    <section className="space-y-3" aria-labelledby={`brand-${kind}`}>
      <h3 id={`brand-${kind}`} className="text-sm font-semibold">{spec.label}</h3>
      <div className={cn("bg-muted relative overflow-hidden border", kind === "icon" ? "size-28 rounded-2xl" : "aspect-[3/1] w-full max-w-xl rounded-xl")}>
        {key ? (
          <MediaImage mediaKey={key} width={kind === "icon" ? 192 : 640} alt={`${name} ${kind}`} className="size-full object-cover" />
        ) : (
          <div className="text-muted-foreground flex size-full items-center justify-center p-2 text-center text-xs">{kind === "icon" ? name.slice(0, 2).toUpperCase() : "No banner yet"}</div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input ref={input} type="file" accept={ACCEPT} onChange={onPick} className="sr-only" id={`upload-${kind}`} aria-label={`Choose a ${kind}`} />
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? <Loader2 className="animate-spin" /> : <ImagePlus />} {key ? "Replace" : "Upload"} {kind}
        </Button>
        {key && !busy && <Button type="button" variant="ghost" size="sm" onClick={remove}><Trash2 /> Remove</Button>}
        {busy && progress !== null && (
          <>
            <Progress value={progress} aria-label={`${spec.label} upload progress`} className="h-1.5 w-40" />
            <Button type="button" variant="ghost" size="xs" onClick={() => controller.current?.abort()}><X /> Cancel</Button>
          </>
        )}
      </div>
      <p className="text-muted-foreground text-xs">{spec.hint} JPG, PNG or WebP, up to 4 MB after cropping.</p>
      {error && (
        <p role="alert" className="text-destructive-text flex items-center gap-2 text-sm">
          {error} <button type="button" onClick={() => input.current?.click()} className="underline">Try again</button>
        </p>
      )}
      {imageEditor}
    </section>
  );
}

export function BrandingPanel({ community }) {
  return (
    <div className="space-y-8">
      <BrandingSlot communityId={community.id} kind="icon" currentKey={community.avatar_key} name={community.name} />
      <BrandingSlot communityId={community.id} kind="banner" currentKey={community.cover_key} name={community.name} />
      <p className="text-muted-foreground text-xs">
        These pictures are shown to anyone who can see the community. Do not use a photo of a person who has not agreed to it. Changes are recorded in the audit log.
      </p>
    </div>
  );
}
