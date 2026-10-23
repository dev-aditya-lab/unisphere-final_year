"use client";

import { memo } from "react";
import { Check, CheckCheck, Copy, MoreHorizontal, RotateCw } from "lucide-react";
import { AlertCircle, Clock, Flag, Trash2 } from "@/components/icons/lucide-compat";
import { toast } from "sonner";
import { ActionMenu } from "@/components/community/action-menu";
import { AttachmentView } from "@/components/community/attachment";
import { Button } from "@/components/ui/button";
import { ChatMarkdown } from "@/components/posts/chat-markdown";
import { cn } from "@/lib/utils";

const timeFmt = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
const time = (iso) => timeFmt.format(new Date(iso));
export const dayLabel = (iso) => dayFmt.format(new Date(iso));

function Status({ send, read, mine }) {
  if (!mine) return null;
  if (send?.state === "failed") return <AlertCircle className="size-3.5" aria-label="Not sent" />;
  if (send) return <Clock className="size-3 opacity-80" aria-label="Sending" />;
  // "Seen" only when the other person's own read position says so. Never "delivered": it cannot be verified.
  return read ? <CheckCheck className="size-3.5" aria-label="Seen" /> : <Check className="size-3.5" aria-label="Sent" />;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Copied");
  } catch {
    toast.error("Your browser would not let us copy that.");
  }
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
              {m.body && <ChatMarkdown text={m.body} className={cn(mine && "[&_a]:text-primary-foreground [&_a]:underline [&_blockquote]:text-primary-foreground/80")} />}
              {m.attachments?.length > 0 && (
                <div className={cn("space-y-1.5", m.body && "mt-1.5")}>
                  {m.attachments.map((f) => (
                    <AttachmentView key={f.id} file={f} />
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
            <ActionMenu
              title="Message"
              align={mine ? "end" : "start"}
              items={[
                { id: "copy", label: "Copy text", icon: Copy, hidden: !m.body, onSelect: () => copyText(m.body) },
                { id: "delete", label: "Delete", icon: Trash2, destructive: true, hidden: !mine, onSelect: () => onDelete(m.id) },
                { id: "report", label: "Report message", icon: Flag, hidden: mine, onSelect: () => onReport(m.id) },
              ]}
              trigger={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="text-muted-foreground shrink-0 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100 max-md:size-8 max-md:opacity-60"
                  aria-label="Message actions"
                >
                  <MoreHorizontal />
                </Button>
              }
            />
          )
        )}
      </div>
    </li>
  );
});
