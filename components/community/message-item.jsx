"use client";

import { memo, useState } from "react";
import Link from "next/link";
import { Check, Clock, Copy, Flag, Link2, MoreHorizontal, Pencil, Pin, PinOff, Reply, RotateCw, ShieldAlert, Trash2 } from "lucide-react";
import { AlertCircle } from "@/components/icons/lucide-compat";
import { toast } from "sonner";
import { ActionMenu } from "@/components/community/action-menu";
import { AttachmentView } from "@/components/community/attachment";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { UserAvatar } from "@/components/user-avatar";
import { ChatMarkdown } from "@/components/posts/chat-markdown";
import { MAX_MESSAGE_CHARS } from "@/lib/community/rules";
import { cn } from "@/lib/utils";

const timeFmt = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const fullFmt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" });
export const dayLabel = (iso) => dayFmt.format(new Date(iso));
const time = (iso) => timeFmt.format(new Date(iso));

const snippet = (text, n = 90) => (text.length > n ? `${text.slice(0, n).trimEnd()}…` : text);

function ReplyPreview({ target, people, onJump }) {
  if (!target) return <p className="text-muted-foreground mb-0.5 text-xs italic">Replying to a message that is no longer here</p>;
  const who = people[target.author_id]?.full_name ?? "UniSphere member";
  return (
    <button type="button" onClick={() => target.id && onJump?.(target.id)} className="text-muted-foreground hover:text-foreground mb-0.5 flex max-w-full items-center gap-1.5 text-left text-xs">
      <Reply className="size-3 shrink-0 -scale-x-100" aria-hidden="true" />
      <span className="shrink-0 font-semibold">{who}</span>
      <span className="truncate">{target.status === "sent" ? snippet(target.body.replace(/\s+/g, " ")) || "Attachment" : "Message deleted"}</span>
    </button>
  );
}

/**
 * One message in a channel. Memoised on primitives and stable callbacks, so a keystroke in the composer or an unrelated live event
 * does not redraw every message. Which actions appear depends on the member's role (`can`); the server checks each one again.
 */
export const MessageItem = memo(function MessageItem({
  m, author, grouped, newDay, viewerId, replyTarget, people, can, highlighted, fresh, unreadDivider,
  onReply, onEdit, onRemove, onPin, onReport, onJump, onRetry, onDiscard, send,
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const mine = m.author_id === viewerId;
  const gone = m.status !== "sent";
  const name = author?.full_name ?? "UniSphere member";
  const mentioned = !gone && Array.isArray(m.mentions) && m.mentions.includes(viewerId);
  const failed = send?.status === "failed";
  const sending = send?.status === "sending";

  async function copy(text, done) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(done);
    } catch {
      toast.error("Your browser would not let us copy that.");
    }
  }

  const items = [
    { id: "reply", label: "Reply", icon: Reply, onSelect: () => onReply(m), hidden: gone || !can.post },
    { id: "copy", label: "Copy text", icon: Copy, onSelect: () => copy(m.body, "Copied"), hidden: gone || !m.body },
    { id: "link", label: "Copy link to message", icon: Link2, onSelect: () => copy(`${window.location.origin}${window.location.pathname}?m=${m.id}`, "Link copied. It only works for people who can see this channel.") },
    { id: "edit", label: "Edit", icon: Pencil, onSelect: () => { setDraft(m.body); setEditing(true); }, hidden: gone || !mine || !can.edit },
    { id: "pin", label: m.pinned_at ? "Unpin" : "Pin to channel", icon: m.pinned_at ? PinOff : Pin, onSelect: () => onPin(m, !m.pinned_at), hidden: gone || !can.pin },
    { id: "report", label: "Report", icon: Flag, onSelect: () => onReport(m), hidden: gone || mine, separatorBefore: true },
    { id: "delete", label: "Delete my message", icon: Trash2, destructive: true, onSelect: () => onRemove(m, "own"), hidden: gone || !mine || !can.deleteOwn, separatorBefore: !mine },
    { id: "remove", label: "Remove (moderator)", icon: ShieldAlert, destructive: true, onSelect: () => onRemove(m, "moderate"), hidden: gone || mine || !can.moderate },
  ];

  return (
    <li
      id={`msg-${m.id}`}
      data-message-id={m.id}
      onContextMenu={(e) => {
        if (gone || send || e.target.closest("a, button, textarea, input")) return;
        e.preventDefault();
        setMenuOpen(true);
      }}
      className={cn("group/msg relative list-none rounded-lg px-3 py-0.5 transition-colors md:px-4", grouped ? "mt-0" : "mt-3", fresh && "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-200", mentioned && "bg-primary-soft/60", highlighted && "bg-accent ring-primary/30 ring-2", "hover:bg-muted/50 focus-within:bg-muted/50")}
    >
      {unreadDivider && (
        <p className="text-primary-text my-2 flex items-center gap-3 text-[11px] font-semibold">
          <span className="bg-primary/40 h-px flex-1" /> New messages <span className="bg-primary/40 h-px flex-1" />
        </p>
      )}
      {newDay && (
        <p className="text-muted-foreground my-3 flex items-center gap-3 text-[11px] font-semibold">
          <span className="bg-border h-px flex-1" />
          {dayLabel(m.created_at)}
          <span className="bg-border h-px flex-1" />
        </p>
      )}
      <div className="flex gap-3">
        <div className="w-9 shrink-0">
          {!grouped && (author?.username ? (
            <Link href={`/u/${author.username}`} prefetch={false} aria-label={`${name}'s profile`}>
              <UserAvatar name={name} avatarKey={author?.avatar_key} size="sm" />
            </Link>
          ) : (
            <UserAvatar name={name} avatarKey={author?.avatar_key} size="sm" />
          ))}
          {grouped && (
            <time dateTime={m.created_at} suppressHydrationWarning className="text-muted-foreground/0 group-hover/msg:text-muted-foreground block pt-1 text-center text-[10px] tabular-nums">
              {time(m.created_at)}
            </time>
          )}
        </div>
        <div className="min-w-0 flex-1">
          {!grouped && (
            <p className="flex flex-wrap items-baseline gap-x-2">
              {author?.username ? (
                <Link href={`/u/${author.username}`} prefetch={false} className="text-sm font-semibold hover:underline">{name}</Link>
              ) : (
                <span className="text-sm font-semibold">{name}</span>
              )}
              <time dateTime={m.created_at} title={fullFmt.format(new Date(m.created_at))} suppressHydrationWarning className="text-muted-foreground text-[11px] tabular-nums">
                {time(m.created_at)}
              </time>
              {m.pinned_at && !gone && (
                <span className="text-primary-text inline-flex items-center gap-1 text-[11px] font-semibold"><Pin className="size-3" aria-hidden="true" /> Pinned</span>
              )}
            </p>
          )}
          {m.reply_to_id && !gone && <ReplyPreview target={replyTarget} people={people} onJump={onJump} />}

          {gone ? (
            <p className="text-muted-foreground text-sm italic">{m.status === "removed" ? "A moderator removed this message." : "This message was deleted."}</p>
          ) : editing ? (
            <form
              className="mt-1 space-y-2"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!draft.trim() && m.attachments.length === 0) return;
                setSaving(true);
                const res = await onEdit(m, draft);
                setSaving(false);
                if (res.ok) setEditing(false);
                else toast.error(res.error);
              }}
            >
              <Textarea
                autoFocus
                value={draft}
                maxLength={MAX_MESSAGE_CHARS}
                rows={3}
                aria-label="Edit your message"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Escape") setEditing(false); }}
              />
              <div className="flex gap-2">
                <Button type="submit" size="xs" disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
                <Button type="button" size="xs" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
                <span className="text-muted-foreground self-center text-[11px]">Esc to cancel</span>
              </div>
            </form>
          ) : (
            <>
              {m.body && <ChatMarkdown text={m.body} className={cn(sending && "opacity-70")} />}
              {m.edited_at && <span className="text-muted-foreground ml-1 text-[10px]" title={fullFmt.format(new Date(m.edited_at))}>(edited)</span>}
              {m.attachments.length > 0 && (
                <div className={cn("flex flex-wrap gap-2", m.body && "mt-1.5")}>
                  {m.attachments.map((f) => <AttachmentView key={f.id} file={f} />)}
                </div>
              )}
            </>
          )}

          {send && (
            <p className={cn("mt-0.5 flex items-center gap-2 text-xs", failed ? "text-destructive-text" : "text-muted-foreground")} role={failed ? "alert" : "status"}>
              {sending && <><Clock className="size-3" aria-hidden="true" /> Sending…</>}
              {failed && (
                <>
                  <AlertCircle className="size-3.5" aria-hidden="true" />
                  <span>{send.error}</span>
                  <Button type="button" variant="ghost" size="xs" onClick={() => onRetry(send.opId)}><RotateCw /> Retry</Button>
                  <Button type="button" variant="ghost" size="xs" onClick={() => onDiscard(send.opId)}>Discard</Button>
                </>
              )}
            </p>
          )}
          {!send && mine && !gone && <span className="sr-only"><Check aria-hidden="true" /> Sent</span>}
        </div>
      </div>

      {!send && (
        <div className="absolute top-0 right-2 -translate-y-1/2 opacity-100 md:opacity-0 md:group-focus-within/msg:opacity-100 md:group-hover/msg:opacity-100">
          <ActionMenu
            open={menuOpen}
            onOpenChange={setMenuOpen}
            title={`Message from ${name}`}
            description={snippet(m.body.replace(/\s+/g, " "), 80) || undefined}
            items={items}
            trigger={
              <button
                type="button"
                aria-label={`Actions for the message from ${name}`}
                className="bg-card text-muted-foreground hover:text-foreground focus-visible:ring-ring/45 grid size-8 place-items-center rounded-lg border shadow-sm outline-none focus-visible:ring-[3px]"
              >
                <MoreHorizontal className="size-4" aria-hidden="true" />
              </button>
            }
          />
        </div>
      )}
    </li>
  );
});
