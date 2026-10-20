"use client";

import { memo } from "react";
import { AlertCircle, Check, CheckCheck, Clock, FileText, Flag, MoreHorizontal, RotateCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { RichText } from "@/components/posts/rich-text";
import { privateFileUrl } from "@/lib/media";
import { cn } from "@/lib/utils";

const timeFmt = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
const time = (iso) => timeFmt.format(new Date(iso));
export const dayLabel = (iso) => dayFmt.format(new Date(iso));

function Attachment({ file }) {
  const url = privateFileUrl(file.id);
  if (file.mime_type?.startsWith("image/")) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-lg">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={file.original_name || "Image attachment"} loading="lazy" decoding="async" className="max-h-64 w-full max-w-72 rounded-lg object-cover" />
      </a>
    );
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="bg-background/70 text-foreground flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs font-medium hover:underline">
      <FileText className="size-4 shrink-0" aria-hidden="true" />
      <span className="truncate">{file.original_name || "Document"}</span>
    </a>
  );
}

function Status({ send, read, mine }) {
  if (!mine) return null;
  if (send?.state === "failed") return <AlertCircle className="size-3.5" aria-label="Not sent" />;
  if (send) return <Clock className="size-3 opacity-80" aria-label="Sending" />;
  // "Seen" only when the other person's own read position says so. Never "delivered": it cannot be verified.
  return read ? <CheckCheck className="size-3.5" aria-label="Seen" /> : <Check className="size-3.5" aria-label="Sent" />;
}

/**
 * One message. Memoised on primitives and stable callbacks: an unrelated change in the thread (a keystroke, typing
 * indicator, another message) does not re-render it.
 */
export const MessageRow = memo(function MessageRow({ m, mine, grouped, newDay, read, onDelete, onReport, onRetry, onDiscard }) {
  const deleted = m.status === "deleted";
  const send = m.send;
  const failed = send?.state === "failed";
  return (
    <li
      className={cn("list-none", grouped ? "mt-0.5" : "mt-2.5")}
      data-message-id={m.id}
    >
      {newDay && (
        <p className="text-muted-foreground my-4 text-center text-[11px] font-medium">
          <span className="bg-muted rounded-full px-2.5 py-1">{dayLabel(m.created_at)}</span>
        </p>
      )}
      <div className={cn("group flex items-end gap-1.5", mine && "flex-row-reverse")}>
        <div
          className={cn(
            "max-w-[min(34rem,82%)] min-w-0 rounded-2xl px-3 py-1.5 text-sm wrap-anywhere",
            mine ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
            mine ? (grouped ? "rounded-tr-md" : "") : grouped ? "rounded-tl-md" : "",
            failed && "ring-destructive/60 ring-2",
          )}
        >
          {deleted ? (
            <p className="italic opacity-70">This message was deleted</p>
          ) : (
            <>
              {m.body && <RichText text={m.body} className={cn(mine && "[&_a]:text-primary-foreground [&_a]:underline")} />}
              {m.attachments?.length > 0 && (
                <div className={cn("space-y-1.5", m.body && "mt-1.5")}>
                  {m.attachments.map((f) => (
                    <Attachment key={f.id} file={f} />
                  ))}
                </div>
              )}
            </>
          )}
          <p className={cn("mt-0.5 flex items-center justify-end gap-1 text-[10px] leading-4 tabular-nums", mine ? "text-primary-foreground/75" : "text-muted-foreground")}>
            {m.edited_at && !deleted && <span>edited</span>}
            <time dateTime={m.created_at} suppressHydrationWarning>
              {time(m.created_at)}
            </time>
            <Status send={send} read={read} mine={mine} />
          </p>
        </div>

        {failed ? (
          <div className="text-destructive flex shrink-0 items-center gap-1 text-xs">
            <span className="sr-only">{send.error}</span>
            <Button type="button" variant="ghost" size="xs" onClick={() => onRetry(m.id)} aria-label="Retry sending">
              <RotateCw /> Retry
            </Button>
            <Button type="button" variant="ghost" size="xs" onClick={() => onDiscard(m.id)} aria-label="Discard message">
              Discard
            </Button>
          </div>
        ) : (
          !deleted &&
          !send && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="text-muted-foreground shrink-0 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100 max-md:size-6 max-md:opacity-50"
                  aria-label="Message actions"
                >
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align={mine ? "end" : "start"}>
                {mine ? (
                  <DropdownMenuItem variant="destructive" onSelect={() => onDelete(m.id)}>
                    <Trash2 /> Delete
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onSelect={() => onReport(m.id)}>
                    <Flag /> Report message
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )
        )}
      </div>
    </li>
  );
});
