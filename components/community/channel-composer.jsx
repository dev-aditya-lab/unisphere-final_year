"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Loader2, Paperclip, RotateCw, Send, X } from "lucide-react";
import { FileText, Lock } from "@/components/icons/lucide-compat";
import { toast } from "sonner";
import { FormattingHelp } from "@/components/community/formatting-help";
import { Button } from "@/components/ui/button";
import { MarkdownEditor } from "@/components/posts/markdown-editor";
import { acknowledgeRulesAction } from "@/lib/actions/community-workspace";
import { prepareImageForChat } from "@/lib/images/compress";
import { uploadFileWithProgress } from "@/lib/storage/client";
import { MAX_ATTACHMENTS, MAX_MESSAGE_CHARS, POST_STATE_TEXT } from "@/lib/community/rules";
import { cn } from "@/lib/utils";

const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";
const ALLOWED = ACCEPT.split(",");
const MAX_PHOTO_BYTES = 30 * 1024 * 1024; // photos are shrunk before upload
const MAX_DOC_BYTES = 10 * 1024 * 1024;
const isImage = (t) => t?.startsWith("image/");

/**
 * The message box of a channel: Markdown with a preview, replies, up to five attachments with progress, cancel and retry,
 * and honest locked states. It owns its own state, so typing never redraws the conversation above it.
 *
 * What it cannot do is decide who may post. The state it is given (`postState`, from the server's channel_post_state) only chooses
 * what to show; the send itself is refused by the database when it should be.
 */
export function ChannelComposer({ channel, communityId, postState, slowModeExempt, replyTo, onCancelReply, onSend, onRulesAccepted }) {
  const [text, setText] = useState("");
  const [items, setItems] = useState([]);
  const [original, setOriginal] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [pendingRules, startRules] = useTransition();
  const area = useRef(null);
  const fileInput = useRef(null);
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // leaving the channel cancels uploads and frees the previews
  useEffect(
    () => () => {
      itemsRef.current.forEach((i) => {
        i.controller?.abort();
        if (i.previewUrl) URL.revokeObjectURL(i.previewUrl);
      });
    },
    [],
  );

  // slow mode: the countdown the server would enforce anyway, so the button says when it will work again
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  useEffect(() => {
    if (replyTo) area.current?.focus();
  }, [replyTo]);

  const patch = useCallback((key, change) => setItems((list) => list.map((i) => (i.key === key ? { ...i, ...change } : i))), []);

  const run = useCallback(
    async (key, source, { asOriginal }) => {
      const controller = new AbortController();
      patch(key, { status: "preparing", progress: 0, error: null, controller });
      const prepared = await prepareImageForChat(source, { original: asOriginal });
      if (controller.signal.aborted) return;
      patch(key, { status: "uploading", progress: 0, name: prepared.file.name });
      const res = await uploadFileWithProgress(prepared.file, "message_attachment", (progress) => patch(key, { progress }), { signal: controller.signal });
      if (res.aborted) return;
      if (res.ok) patch(key, { status: "ready", fileId: res.fileId, mime: res.mime ?? prepared.file.type, size: res.size ?? prepared.file.size, progress: 100, controller: null });
      else patch(key, { status: "error", error: res.error ?? "Upload failed", controller: null });
    },
    [patch],
  );

  function addFiles(list) {
    const room = MAX_ATTACHMENTS - itemsRef.current.length;
    let chosen = Array.from(list ?? []);
    if (chosen.length > room) {
      toast.error(`You can attach up to ${MAX_ATTACHMENTS} files to a message.`);
      chosen = chosen.slice(0, Math.max(0, room));
    }
    for (const f of chosen) {
      if (!ALLOWED.includes(f.type)) {
        toast.error(`${f.name}: only photos (JPEG, PNG, WebP) and PDFs can be sent.`);
        continue;
      }
      if (f.size > (isImage(f.type) ? MAX_PHOTO_BYTES : MAX_DOC_BYTES)) {
        toast.error(`${f.name} is too large.`);
        continue;
      }
      const key = crypto.randomUUID();
      setItems((l) => [...l, { key, source: f, name: f.name, mime: f.type, status: "preparing", progress: 0, previewUrl: isImage(f.type) ? URL.createObjectURL(f) : null, fileId: null, error: null }]);
      run(key, f, { asOriginal: original });
    }
  }

  function remove(key) {
    const item = itemsRef.current.find((i) => i.key === key);
    item?.controller?.abort();
    if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
    setItems((l) => l.filter((i) => i.key !== key));
  }

  const busy = items.some((i) => i.status === "preparing" || i.status === "uploading");
  const ready = items.filter((i) => i.status === "ready");
  const blocked = items.some((i) => i.status === "error");
  const canSend = (text.trim().length > 0 || ready.length > 0) && !busy && !blocked && cooldown === 0;

  function submit(e) {
    e?.preventDefault();
    if (!canSend) return;
    onSend({ body: text, files: ready.map((i) => ({ id: i.fileId, name: i.name, mime: i.mime })), replyTo: replyTo?.id ?? null });
    setText("");
    items.forEach((i) => i.previewUrl && URL.revokeObjectURL(i.previewUrl));
    setItems([]);
    onCancelReply?.();
    if (channel.slow_mode_seconds > 0 && !slowModeExempt) setCooldown(channel.slow_mode_seconds);
    area.current?.focus();
  }

  if (postState !== "ok") {
    const explanation = POST_STATE_TEXT[postState] ?? "You cannot post here.";
    return (
      <div className="bg-card/60 flex flex-wrap items-center gap-3 border-t px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]" role="status">
        <Lock className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
        <p className="text-muted-foreground min-w-0 flex-1 text-sm">{explanation}</p>
        {postState === "rules_required" && (
          <Button
            size="sm"
            disabled={pendingRules}
            onClick={() =>
              startRules(async () => {
                const res = await acknowledgeRulesAction(communityId);
                if (res.ok) {
                  toast.success("Thanks. You can post now.");
                  onRulesAccepted?.();
                } else toast.error(res.error);
              })
            }
          >
            I accept the rules
          </Button>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="bg-card/60 border-t px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      {replyTo && (
        <div className="bg-muted mb-2 flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs">
          <span className="min-w-0 flex-1 truncate">
            Replying to <strong>{replyTo.authorName}</strong>: <span className="text-muted-foreground">{replyTo.snippet}</span>
          </span>
          <button type="button" onClick={onCancelReply} aria-label="Cancel reply" className="text-muted-foreground hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>
      )}
      {items.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-2" aria-label="Attachments">
          {items.map((i) => (
            <li key={i.key} className="bg-muted flex max-w-full items-center gap-2 rounded-lg border p-1.5 pr-2 text-xs">
              {i.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={i.previewUrl} alt="" className="size-10 shrink-0 rounded-md object-cover" />
              ) : (
                <span className="bg-background grid size-10 shrink-0 place-items-center rounded-md"><FileText className="size-4" aria-hidden="true" /></span>
              )}
              <span className="min-w-0">
                <span className="block max-w-40 truncate font-medium">{i.name}</span>
                <span className={cn("block", i.status === "error" ? "text-destructive-text" : "text-muted-foreground")} role={i.status === "error" ? "alert" : undefined}>
                  {i.status === "preparing" && "Preparing…"}
                  {i.status === "uploading" && `Uploading ${i.progress}%`}
                  {i.status === "ready" && "Ready"}
                  {i.status === "error" && i.error}
                </span>
                {(i.status === "uploading" || i.status === "preparing") && (
                  <span className="bg-border mt-0.5 block h-1 overflow-hidden rounded-full" aria-hidden="true">
                    <span className="bg-primary block h-full transition-[width]" style={{ width: `${i.status === "preparing" ? 8 : i.progress}%` }} />
                  </span>
                )}
              </span>
              {i.status === "error" && (
                <button type="button" onClick={() => run(i.key, i.source, { asOriginal: original })} aria-label={`Retry uploading ${i.name}`} className="text-muted-foreground hover:text-foreground">
                  <RotateCw className="size-3.5" />
                </button>
              )}
              <button type="button" onClick={() => remove(i.key)} aria-label={i.status === "uploading" ? `Cancel uploading ${i.name}` : `Remove ${i.name}`} className="text-muted-foreground hover:text-foreground">
                <X className="size-3.5" />
              </button>
            </li>
          ))}
          <li className="flex items-center">
            <label className="text-muted-foreground flex items-center gap-1.5 text-xs">
              <input type="checkbox" checked={original} onChange={(e) => setOriginal(e.target.checked)} className="accent-primary" /> Original quality
            </label>
          </li>
        </ul>
      )}
      <div className="flex items-end gap-2">
        <input ref={fileInput} type="file" accept={ACCEPT} multiple className="sr-only" tabIndex={-1} aria-label="Attach files" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
        {channel.allow_attachments && (
          <Button type="button" variant="ghost" size="icon" disabled={items.length >= MAX_ATTACHMENTS} onClick={() => fileInput.current?.click()} aria-label="Attach a file" className="mb-0.5 shrink-0">
            <Paperclip />
          </Button>
        )}
        <span className="mb-0.5 hidden sm:block"><FormattingHelp /></span>
        <div className="min-w-0 flex-1">
          <MarkdownEditor
            ref={area}
            id="channel-message"
            value={text}
            onChange={setText}
            maxLength={MAX_MESSAGE_CHARS}
            rows={1}
            aria-label={`Message #${channel.name}`}
            placeholder={`Message #${channel.name}`}
            enterKeyHint="send"
            hashtags={false}
            className="max-h-40 min-h-10 resize-none py-2"
            previewClassName="text-sm"
            onKeyDown={(e) => {
              if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
              // On a phone Enter is a new line and the Send button sends; on a computer Enter sends.
              if (window.matchMedia?.("(pointer: coarse)").matches) return;
              e.preventDefault();
              submit();
            }}
          />
        </div>
        <Button type="submit" variant="soft" size="icon" disabled={!canSend} aria-label={cooldown ? `Send (slow mode, ${cooldown} seconds)` : "Send message"} className="mb-0.5 shrink-0">
          {busy ? <Loader2 className="animate-spin" /> : cooldown ? <span className="text-xs tabular-nums">{cooldown}</span> : <Send />}
        </Button>
      </div>
      {(channel.slow_mode_seconds > 0 || text.length > MAX_MESSAGE_CHARS - 500) && (
        <p className={cn("mt-1 flex justify-between gap-2 text-[11px]", text.length >= MAX_MESSAGE_CHARS ? "text-destructive-text" : "text-muted-foreground")} aria-live="polite">
          <span>{channel.slow_mode_seconds > 0 ? (slowModeExempt ? "Slow mode is on. It does not apply to you." : `Slow mode: one message every ${channel.slow_mode_seconds} seconds.`) : ""}</span>
          {text.length > MAX_MESSAGE_CHARS - 500 && <span>{MAX_MESSAGE_CHARS - text.length} characters left</span>}
        </p>
      )}
    </form>
  );
}
