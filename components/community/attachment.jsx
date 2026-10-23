"use client";

import { useState } from "react";
import { Copy, Download, ExternalLink, ImageOff, MoreHorizontal, RotateCw } from "lucide-react";
import { FileText } from "@/components/icons/lucide-compat";
import { toast } from "sonner";
import { ActionMenu } from "@/components/community/action-menu";
import { privateFileUrl } from "@/lib/media";
import { cn } from "@/lib/utils";

export function formatBytes(n) {
  const size = Number(n);
  if (!Number.isFinite(size) || size <= 0) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

const TYPE_LABEL = { "application/pdf": "PDF document", "image/jpeg": "JPEG image", "image/png": "PNG image", "image/webp": "WebP image" };
export const typeLabel = (mime) => TYPE_LABEL[mime] ?? "File";

async function copyText(text, done) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(done);
  } catch {
    toast.error("Your browser would not let us copy that.");
  }
}

/**
 * One attachment on a message. Every address here is /api/files/<id>: the route checks, for this member, that they may open the
 * file, then sends them to a short-lived signed address. There is no public address to share, so "Copy link" copies a link that
 * only works for people who can already see the message. A picture that cannot be loaded (expired, removed, offline) says so and
 * can be tried again; a document shows its name, kind and size and opens or downloads on request.
 */
export function AttachmentView({ file, className }) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const base = privateFileUrl(file.id);
  const isImage = file.mime_type?.startsWith("image/");
  const name = file.original_name || (isImage ? "Image" : "Document");
  const href = attempt ? `${base}?r=${attempt}` : base;
  const download = `${base}?download=1`;

  const items = [
    { id: "open", label: isImage ? "View full size" : "Open", icon: ExternalLink, href, external: true },
    { id: "download", label: "Download", icon: Download, href: download },
    { id: "copy", label: "Copy link", icon: Copy, onSelect: () => copyText(new URL(base, window.location.origin).href, "Link copied. It only works for people who can see this message.") },
  ];
  const menu = (
    <ActionMenu
      title={name}
      description={[typeLabel(file.mime_type), formatBytes(file.size)].filter(Boolean).join(" · ")}
      items={items}
      trigger={
        <button
          type="button"
          aria-label={`Actions for ${name}`}
          className="bg-background/85 text-foreground hover:bg-background focus-visible:ring-ring/45 grid size-8 place-items-center rounded-full border shadow-sm outline-none focus-visible:ring-[3px]"
        >
          <MoreHorizontal className="size-4" aria-hidden="true" />
        </button>
      }
    />
  );

  if (isImage) {
    if (failed) {
      return (
        <div className={cn("bg-muted text-muted-foreground flex w-full max-w-72 flex-col items-center gap-2 rounded-lg border border-dashed p-4 text-center text-xs", className)} role="group" aria-label={`${name} could not be loaded`}>
          <ImageOff className="size-5" aria-hidden="true" />
          <p>This picture could not be loaded. It may have been removed, or you may be offline.</p>
          <button
            type="button"
            onClick={() => {
              setFailed(false);
              setAttempt((n) => n + 1);
            }}
            className="text-primary-text inline-flex items-center gap-1 font-semibold hover:underline"
          >
            <RotateCw className="size-3.5" aria-hidden="true" /> Try again
          </button>
        </div>
      );
    }
    // The stored width and height reserve the space before the picture arrives, so the conversation does not jump when it loads.
    const ratio = file.width && file.height ? file.width / file.height : null;
    return (
      <div className={cn("group/att relative max-w-full", ratio ? "" : "w-fit")} style={ratio ? { width: `min(100%, ${(ratio * 18).toFixed(2)}rem)` } : undefined}>
        <a href={href} target="_blank" rel="noopener noreferrer" className={cn("bg-muted block overflow-hidden rounded-lg", className)} style={ratio ? { aspectRatio: String(ratio) } : undefined}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={href}
            alt={file.original_name ? `Image: ${file.original_name}` : "Image attachment"}
            loading="lazy"
            decoding="async"
            onError={() => setFailed(true)}
            className={cn("block rounded-lg object-cover", ratio ? "size-full" : "max-h-72 w-auto max-w-full")}
          />
        </a>
        <span className="absolute top-1.5 right-1.5 opacity-100 transition-opacity md:opacity-0 md:group-focus-within/att:opacity-100 md:group-hover/att:opacity-100">{menu}</span>
      </div>
    );
  }

  return (
    <div className={cn("bg-background/70 text-foreground flex w-full max-w-72 items-center gap-2.5 rounded-lg border p-2", className)}>
      <span className="bg-muted grid size-10 shrink-0 place-items-center rounded-md" aria-hidden="true">
        <FileText className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <a href={href} target="_blank" rel="noopener noreferrer" className="block truncate text-sm font-medium hover:underline" title={name}>
          {name}
        </a>
        <span className="text-muted-foreground block text-xs">{[typeLabel(file.mime_type), formatBytes(file.size)].filter(Boolean).join(" · ")}</span>
      </span>
      <a href={download} aria-label={`Download ${name}`} className="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring/45 grid size-8 shrink-0 place-items-center rounded-lg outline-none focus-visible:ring-[3px]">
        <Download className="size-4" aria-hidden="true" />
      </a>
      {menu}
    </div>
  );
}
