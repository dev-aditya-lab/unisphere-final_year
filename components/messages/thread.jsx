"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, BellOff, Bell, Check, CheckCheck, Flag, FileText, Loader2, MoreHorizontal, Paperclip, Send, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { UserAvatar } from "@/components/user-avatar";
import { ReportDialog } from "@/components/posts/report-dialog";
import { RichText } from "@/components/posts/rich-text";
import { deleteMessageAction, loadMessagesAction, markConversationReadAction, sendMessageAction, setMutedAction } from "@/lib/actions/messages";
import { useRealtimeChannel } from "@/hooks/use-realtime-channel";
import { uploadFileWithProgress } from "@/lib/storage/client";
import { useImageEditor } from "@/components/images/use-image-editor";
import { privateFileUrl } from "@/lib/media";
import { cn } from "@/lib/utils";

const time = (iso) => new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" }).format(new Date(iso));
const day = (iso) => new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(iso));

function Attachment({ file }) {
  const url = privateFileUrl(file.id);
  if (file.mime_type?.startsWith("image/")) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={file.original_name || "Image attachment"} loading="lazy" className="max-h-60 rounded-md border object-cover" />
      </a>
    );
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="bg-background/60 flex items-center gap-2 rounded-md border px-2.5 py-2 text-xs font-medium hover:underline">
      <FileText className="size-4" aria-hidden="true" /> {file.original_name || "Document"}
    </a>
  );
}

/** One conversation: realtime messages, typing indicator, read receipts, attachments, delete & report. */
export function Thread({ conversation, viewerId, initialMessages, initialCursor }) {
  const router = useRouter();
  const [messages, setMessages] = useState(() => [...initialMessages].reverse());
  const [cursor, setCursor] = useState(initialCursor);
  const [body, setBody] = useState("");
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(0);
  const [typing, setTyping] = useState(false);
  const [otherReadAt, setOtherReadAt] = useState(conversation.otherLastReadAt);
  const [muted, setMuted] = useState(conversation.muted);
  const [reportId, setReportId] = useState(null);
  const [pending, startTransition] = useTransition();
  const bottom = useRef(null);
  const fileInput = useRef(null);
  const { editImages, imageEditor } = useImageEditor();
  const typingTimeout = useRef(null);
  const lastTypingSent = useRef(0);
  const person = conversation.person;

  const scrollDown = useCallback(() => bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" }), []);

  // Realtime: new messages, deletions, the other person's read position, and typing broadcasts.
  const channelRef = useRealtimeChannel(`thread:${conversation.id}`, (channel) => {
    const cid = conversation.id;
    channel
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${cid}` }, (payload) => {
        const m = payload.new;
        if (m.sender_id === viewerId) return; // our own sends are added optimistically
        setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, { ...m, attachments: [] }]));
        setTyping(false);
        // attachments are inserted just after the message; fetch them shortly
        setTimeout(async () => {
          const res = await loadMessagesAction({ conversationId: cid, before: null });
          if (res.ok) setMessages((prev) => prev.map((x) => res.items.find((r) => r.id === x.id) ?? x));
        }, 700);
        markConversationReadAction(cid);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter: `conversation_id=eq.${cid}` }, (payload) => {
        setMessages((prev) => prev.map((x) => (x.id === payload.new.id ? { ...x, ...payload.new, attachments: payload.new.status === "deleted" ? [] : x.attachments } : x)));
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "conversation_members", filter: `conversation_id=eq.${cid}` }, (payload) => {
        if (payload.new.user_id !== viewerId) setOtherReadAt(payload.new.last_read_at);
      })
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        if (payload?.userId === viewerId) return;
        setTyping(true);
        clearTimeout(typingTimeout.current);
        typingTimeout.current = setTimeout(() => setTyping(false), 3500);
      });
  });

  useEffect(() => {
    markConversationReadAction(conversation.id).then(() => router.refresh());
    return () => clearTimeout(typingTimeout.current);
  }, [conversation.id, router]);

  useEffect(() => {
    scrollDown();
  }, [messages.length, typing, scrollDown]);

  function announceTyping() {
    const now = Date.now();
    if (now - lastTypingSent.current < 2000) return;
    lastTypingSent.current = now;
    channelRef.current?.send({ type: "broadcast", event: "typing", payload: { userId: viewerId } });
  }

  async function onPickFiles(e) {
    const chosen = Array.from(e.target.files ?? []).slice(0, 3 - files.length);
    e.target.value = "";
    // Images open in the editor (crop, rotate, resize); PDFs go straight through.
    const picked = await editImages(chosen);
    for (const file of picked) {
      setUploading((n) => n + 1);
      const res = await uploadFileWithProgress(file, "message_attachment");
      setUploading((n) => n - 1);
      if (res.ok) setFiles((prev) => [...prev, { id: res.fileId, name: file.name, mime: res.mime }]);
      else toast.error(res.error ?? "Upload failed");
    }
  }

  function send(e) {
    e.preventDefault();
    const text = body;
    const attach = files;
    if (!text.trim() && attach.length === 0) return;
    setBody("");
    setFiles([]);
    startTransition(async () => {
      const res = await sendMessageAction({ conversationId: conversation.id, body: text, fileIds: attach.map((f) => f.id) });
      if (res.ok) setMessages((prev) => (prev.some((x) => x.id === res.message.id) ? prev : [...prev, res.message]));
      else {
        setBody(text);
        setFiles(attach);
        toast.error(res.error);
      }
    });
  }

  function loadOlder() {
    startTransition(async () => {
      const res = await loadMessagesAction({ conversationId: conversation.id, before: cursor });
      if (res.ok) {
        setMessages((prev) => {
          const seen = new Set(prev.map((m) => m.id));
          return [...[...res.items].reverse().filter((m) => !seen.has(m.id)), ...prev];
        });
        setCursor(res.nextCursor);
      }
    });
  }

  async function remove(id) {
    const res = await deleteMessageAction(id);
    if (res.ok) setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, status: "deleted", body: "", attachments: [] } : m)));
    else toast.error(res.error);
  }

  async function toggleMute() {
    const res = await setMutedAction({ conversationId: conversation.id, muted: !muted });
    if (res.ok) {
      setMuted(res.muted);
      toast.success(res.muted ? "Conversation muted" : "Notifications on");
    }
  }

  const lastMine = useMemo(() => [...messages].reverse().find((m) => m.sender_id === viewerId && m.status === "sent"), [messages, viewerId]);
  const seen = lastMine && otherReadAt && new Date(otherReadAt) >= new Date(lastMine.created_at);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b p-3">
        <Link href="/messages" className="text-muted-foreground hover:text-foreground md:hidden" aria-label="Back to conversations"><ArrowLeft className="size-5" /></Link>
        <UserAvatar name={person.full_name} avatarKey={person.avatar_key} size="sm" />
        <div className="min-w-0 flex-1 leading-tight">
          {person.username ? <Link href={`/u/${person.username}`} className="truncate text-sm font-semibold hover:underline">{person.full_name}</Link> : <span className="text-sm font-semibold">{person.full_name}</span>}
          <p className="text-muted-foreground h-4 truncate text-xs" aria-live="polite">{typing ? "typing…" : person.headline ?? ""}</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Conversation options"><MoreHorizontal /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={toggleMute}>{muted ? <><Bell /> Turn notifications on</> : <><BellOff /> Mute notifications</>}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4" role="log" aria-label={`Conversation with ${person.full_name}`} aria-live="polite">
        {cursor && (
          <div className="mb-3 text-center">
            <Button variant="ghost" size="sm" onClick={loadOlder} disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : null} Load earlier messages</Button>
          </div>
        )}
        {messages.length === 0 && <p className="text-muted-foreground py-10 text-center text-sm">Say hello to {person.full_name.split(" ")[0]}.</p>}
        <ul className="space-y-1.5">
          {messages.map((m, i) => {
            const mine = m.sender_id === viewerId;
            const newDay = i === 0 || day(messages[i - 1].created_at) !== day(m.created_at);
            return (
              <li key={m.id}>
                {newDay && <p className="text-muted-foreground my-3 text-center text-[11px] font-medium">{day(m.created_at)}</p>}
                <div className={cn("group flex items-end gap-2", mine && "flex-row-reverse")}>
                  <div className={cn("max-w-[78%] rounded-2xl px-3.5 py-2 text-sm", mine ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-muted rounded-bl-sm")}>
                    {m.status === "deleted" ? (
                      <p className="italic opacity-70">This message was deleted</p>
                    ) : (
                      <>
                        {m.body && <RichText text={m.body} className={cn(mine && "[&_a]:text-primary-foreground")} />}
                        {m.attachments?.length > 0 && <div className="mt-1.5 space-y-1.5">{m.attachments.map((f) => <Attachment key={f.id} file={f} />)}</div>}
                      </>
                    )}
                    <p className={cn("mt-0.5 flex items-center justify-end gap-1 text-[10px]", mine ? "text-primary-foreground/70" : "text-muted-foreground")}>
                      {time(m.created_at)}{m.edited_at ? " · edited" : ""}
                      {mine && m.id === lastMine?.id && (seen ? <CheckCheck className="size-3" aria-label="Seen" /> : <Check className="size-3" aria-label="Sent" />)}
                    </p>
                  </div>
                  {m.status !== "deleted" && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-xs" className="text-muted-foreground opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100" aria-label="Message actions"><MoreHorizontal /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align={mine ? "end" : "start"}>
                        {mine ? <DropdownMenuItem variant="destructive" onSelect={() => remove(m.id)}><Trash2 /> Delete</DropdownMenuItem> : <DropdownMenuItem onSelect={() => setReportId(m.id)}><Flag /> Report message</DropdownMenuItem>}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        <div ref={bottom} />
      </div>

      {conversation.canSend ? (
        <form onSubmit={send} className="border-t p-3">
          {files.length > 0 && (
            <ul className="mb-2 flex flex-wrap gap-2" aria-label="Attachments">
              {files.map((f) => (
                <li key={f.id} className="bg-muted flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs">
                  {f.name}
                  <button type="button" onClick={() => setFiles((p) => p.filter((x) => x.id !== f.id))} aria-label={`Remove ${f.name}`}><X className="size-3" /></button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-end gap-2">
            <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple className="sr-only" onChange={onPickFiles} aria-label="Attach files" />
            <Button type="button" variant="ghost" size="icon" disabled={files.length >= 3 || uploading > 0} onClick={() => fileInput.current?.click()} aria-label="Attach a file">
              {uploading > 0 ? <Loader2 className="animate-spin" /> : <Paperclip />}
            </Button>
            <label htmlFor="message-input" className="sr-only">Message</label>
            <Textarea
              id="message-input" rows={1} value={body} maxLength={4000} className="max-h-32 min-h-9 resize-none"
              placeholder={`Message ${person.full_name.split(" ")[0]}`}
              onChange={(e) => { setBody(e.target.value); announceTyping(); }}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }}
            />
            <Button type="submit" size="icon" disabled={pending || uploading > 0 || (!body.trim() && files.length === 0)} aria-label="Send message"><Send /></Button>
          </div>
        </form>
      ) : (
        <p className="text-muted-foreground border-t p-4 text-center text-sm">You can no longer send messages in this conversation. {person.full_name.split(" ")[0]} may have changed who can message them, or one of you has blocked the other.</p>
      )}
      {reportId && <ReportDialog open onOpenChange={(o) => !o && setReportId(null)} targetType="message" targetId={reportId} />}
      {imageEditor}
    </div>
  );
}
