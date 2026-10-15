"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { UserAvatar } from "@/components/user-avatar";
import { uploadFileWithProgress } from "@/lib/storage/client";
import { useImageEditor } from "@/components/images/use-image-editor";
import { AVATAR_SIZES, COVER_SIZES } from "@/lib/images/geometry";
import { setProfileImageAction } from "@/lib/actions/profile";
import { mediaUrl } from "@/lib/media";
import { cn } from "@/lib/utils";

const ACCEPT = "image/jpeg,image/png,image/webp";

/**
 * Avatar / cover uploader: sends the file through /api/upload (validated server-side),
 * then attaches it to the profile. Shows progress and recoverable errors.
 */
export function ProfileImageUpload({ kind, currentKey, name }) {
  const inputRef = useRef(null);
  const [progress, setProgress] = useState(null);
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(currentKey);
  const { editImages, imageEditor } = useImageEditor();

  async function onPick(e) {
    const picked = e.target.files?.[0];
    e.target.value = "";
    if (!picked) return;
    // The crop shape is fixed to how the image is shown: a square (round) avatar, a 3:1 cover.
    const [file] = await editImages(
      [picked],
      kind === "avatar"
        ? { title: "Adjust your profile photo", aspect: 1, lockAspect: true, shape: "round", sizes: AVATAR_SIZES, defaultSize: "medium" }
        : { title: "Adjust your cover image", aspect: 3, lockAspect: true, sizes: COVER_SIZES, defaultSize: "large" },
    );
    if (!file) return;
    setBusy(true);
    setProgress(0);
    const up = await uploadFileWithProgress(file, kind, setProgress);
    if (!up.ok) {
      toast.error(up.error ?? "Upload failed");
      setBusy(false);
      setProgress(null);
      return;
    }
    const res = await setProfileImageAction({ kind, fileId: up.fileId });
    setBusy(false);
    setProgress(null);
    if (res.ok) {
      setKey(res.key);
      toast.success(kind === "avatar" ? "Profile photo updated" : "Cover image updated");
    } else {
      toast.error(res.error);
    }
  }

  async function remove() {
    setBusy(true);
    const res = await setProfileImageAction({ kind, fileId: null });
    setBusy(false);
    if (res.ok) {
      setKey(null);
      toast.success("Image removed");
    } else toast.error(res.error);
  }

  const isAvatar = kind === "avatar";
  const label = isAvatar ? "profile photo" : "cover image";

  return (
    <div className={cn("flex gap-4", isAvatar ? "items-center" : "flex-col")}>
      {isAvatar ? (
        <UserAvatar name={name} avatarKey={key} size="xl" />
      ) : (
        <div className="bg-muted relative aspect-[3/1] w-full overflow-hidden rounded-lg border">
          {key ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mediaUrl(key)} alt="Cover preview" className="size-full object-cover" />
          ) : (
            <div className="text-muted-foreground flex size-full items-center justify-center text-sm">No cover image</div>
          )}
        </div>
      )}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <input ref={inputRef} type="file" accept={ACCEPT} onChange={onPick} className="sr-only" id={`upload-${kind}`} aria-label={`Choose ${label}`} />
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? <Loader2 className="animate-spin" /> : <ImagePlus />}
            {key ? "Replace" : "Upload"} {label}
          </Button>
          {key && (
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={remove}>
              <Trash2 /> Remove
            </Button>
          )}
        </div>
        {progress !== null && <Progress value={progress} aria-label="Upload progress" className="h-1.5 w-48" />}
        <p className="text-muted-foreground text-xs">JPG, PNG or WebP. You can crop and resize before it uploads.</p>
      </div>
      {imageEditor}
    </div>
  );
}
