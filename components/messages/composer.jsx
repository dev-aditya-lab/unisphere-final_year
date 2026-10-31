"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Eye, Loader2, Paperclip, Pencil as PencilIcon, RotateCw, X } from "lucide-react";
import { FileText, Pencil } from "@/components/icons/lucide-compat";
import { AnimatedIcon } from "@/components/icons/animated-icon";
import { toast } from "sonner";
import { FormattingHelp } from "@/components/community/formatting-help";
import { ChatMarkdown } from "@/components/posts/chat-markdown";
import { Button } from "@/components/ui/button";
import { useImageEditor } from "@/components/images/use-image-editor";
import { useEngine } from "@/components/messages/messages-provider";
import { prepareImageForChat } from "@/lib/images/compress";
import { uploadFileWithProgress } from "@/lib/storage/client";
import { LIMITS } from "@/lib/chat/model";
import { cn } from "@/lib/utils";

const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";
const ALLOWED = ACCEPT.split(",");
// Photos are shrunk before upload, so the limit before that is generous; everything else is held to the server limit.
const MAX_PHOTO_BYTES = 30 * 1024 * 1024;
const MAX_DOC_BYTES = 10 * 1024 * 1024;

const isImage = (t) => t?.startsWith("image/");

/** The message box. Owns its own state, so typing never re-renders the conversation above it. */
export function Composer({ conversationId, firstName }) {
  const engine = useEngine();
  const [text, setText] = useState(() => engine.getDraft(conversationId));
  const [items, setItems] = useState([]);
  const [original, setOriginal] = useState(false);
  const [preview, setPreview] = useState(false);
  const [sent, setSent] = useState(0); // counts messages sent from here, so the send icon animates only on a real send
  const area = useRef(null);
  const fileInput = useRef(null);
  const itemsRef = useRef(items);
  const { editImages, imageEditor } = useImageEditor();

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // The draft may arrive from the device store a moment after the first paint (a fresh page load).
  useEffect(() => {
    let live = true;
    engine.ready.then(() => {
      if (live) setText((current) => current || engine.getDraft(conversationId));
    });
    return () => {
      live = false;
      engine.flushDraft(conversationId);
    };
  }, [engine, conversationId]);

  // Grow with the text, up to a limit.
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
  }, [text]);

  // Cancel in-flight uploads and free previews when leaving the conversation.
  useEffect(
    () => () => {
      itemsRef.current.forEach((i) => {
        i.controller?.abort();
        if (i.previewUrl) URL.revokeObjectURL(i.previewUrl);
      });
    },
    [],
  );

  const patch = useCallback((key, change) => setItems((list) => list.map((i) => (i.key === key ? { ...i, ...change } : i))), []);

  const run = useCallback(
    async (key, source, { asOriginal }) => {
      const controller = new AbortController();
      patch(key, { status: "preparing", progress: 0, error: null, controller });
      const prepared = await prepareImageForChat(source, { original: asOriginal });
      if (controller.signal.aborted) return;
      patch(key, { status: "uploading", progress: 0, name: prepared.file.name, note: prepared.changed ? `${Math.round(prepared.before / 1024)} KB → ${Math.round(prepared.after / 1024)} KB` : null });
      const res = await uploadFileWithProgress(prepared.file, "message_attachment", (progress) => patch(key, { progress }), { signal: controller.signal });
      if (res.aborted) return;
      if (res.ok) patch(key, { status: "ready", fileId: res.fileId, mime: res.mime ?? prepared.file.type, progress: 100, controller: null });
      else patch(key, { status: "error", error: res.error ?? "Upload failed", controller: null });
    },
    [patch],
  );

  async function addFiles(list) {
    const room = LIMITS.maxFiles - itemsRef.current.length;
    let chosen = Array.from(list ?? []);
    if (chosen.length > room) {
      toast.error(`You can attach up to ${LIMITS.maxFiles} files.`);
      chosen = chosen.slice(0, Math.max(0, room));
    }
    const accepted = [];
    for (const f of chosen) {
      if (!ALLOWED.includes(f.type)) toast.error(`${f.name}: only photos (JPEG, PNG, WebP) and PDFs can be sent.`);
      else if (f.size > (isImage(f.type) ? MAX_PHOTO_BYTES : MAX_DOC_BYTES)) toast.error(`${f.name} is too large.`);
      else accepted.push(f);
    }
    for (const source of accepted) {
      const key = crypto.randomUUID();
      setItems((l) => [
        ...l,
        { key, source, name: source.name, mime: source.type, status: "preparing", progress: 0, previewUrl: isImage(source.type) ? URL.createObjectURL(source) : null, fileId: null, error: null },
      ]);
      run(key, source, { asOriginal: original });
    }
  }

  function remove(key) {
    const item = itemsRef.current.find((i) => i.key === key);
    item?.controller?.abort();
    if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
    setItems((l) => l.filter((i) => i.key !== key));
  }

  async function edit(key) {
    const item = itemsRef.current.find((i) => i.key === key);
    if (!item) return;
    item.controller?.abort();
    const [edited] = await editImages([item.source]);
    if (!edited) return;
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    patch(key, { source: edited, name: edited.name, previewUrl: URL.createObjectURL(edited) });
    run(key, edited, { asOriginal: true }); // the editor already produced the final image
  }

  const busy = items.some((i) => i.status === "preparing" || i.status === "uploading");
  const ready = items.filter((i) => i.status === "ready");
  const blockedByError = items.some((i) => i.status === "error");
  const canSend = (text.trim().length > 0 || ready.length > 0) && !busy && !blockedByError;

  function submit(e) {
    e?.preventDefault();
    if (!canSend) return;
    const result = engine.send(conversationId, { body: text, files: ready.map((i) => ({ id: i.fileId, name: i.name, mime: i.mime })) });
    if (!result.ok) {
      if (result.reason === "cannot_send") toast.error("You can no longer send messages in this conversation.");
      else if (result.reason === "too_long") toast.error(`Messages can be up to ${LIMITS.maxBody} characters.`);
      return;
    }
    // On screen and queued already. The saved draft goes only once the message is safe on this device too.
    setSent((n) => n + 1);
    setText("");
    items.forEach((i) => i.previewUrl && URL.revokeObjectURL(i.previewUrl));
    setItems([]);
    result.persisted.finally(() => engine.clearDraft(conversationId));
    area.current?.focus();
  }

  function onKeyDown(e) {
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
    // On a phone the keyboard's Enter is a new line and the Send button sends; on a computer Enter sends.
    if (window.matchMedia?.("(pointer: coarse)").matches) return;
    e.preventDefault();
    submit();
  }

  return (
    <form onSubmit={submit} className="bg-card pl-safe pr-safe shrink-0 border-t px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:px-3">
      {items.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-2" aria-label="Attachments">
          {items.map((i) => (
            <li key={i.key} className="bg-muted flex max-w-full items-center gap-2 rounded-lg border p-1.5 pr-2 text-xs">
              {i.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={i.previewUrl} alt="" className="size-10 shrink-0 rounded-md object-cover" />
              ) : (
                <span className="bg-background grid size-10 shrink-0 place-items-center rounded-md">
                  <FileText className="size-4" aria-hidden="true" />
                </span>
              )}
              <span className="min-w-0">
                <span className="block max-w-40 truncate font-medium">{i.name}</span>
                <span className={cn("block", i.status === "error" ? "text-destructive" : "text-muted-foreground")} role={i.status === "error" ? "alert" : undefined}>
                  {i.status === "preparing" && "Preparing…"}
                  {i.status === "uploading" && `Uploading ${i.progress}%`}
                  {i.status === "ready" && (i.note ?? "Ready")}
                  {i.status === "error" && i.error}
                </span>
              </span>
              {i.status === "error" && (
                <button type="button" onClick={() => run(i.key, i.source, { asOriginal: original })} aria-label={`Retry uploading ${i.name}`} className="text-muted-foreground hover:text-foreground">
                  <RotateCw className="size-3.5" />
                </button>
              )}
              {isImage(i.mime) && i.status !== "preparing" && i.status !== "uploading" && (
                <button type="button" onClick={() => edit(i.key)} aria-label={`Edit ${i.name}`} className="text-muted-foreground hover:text-foreground">
                  <Pencil className="size-3.5" />
                </button>
              )}
              <button type="button" onClick={() => remove(i.key)} aria-label={i.status === "uploading" ? `Cancel uploading ${i.name}` : `Remove ${i.name}`} className="text-muted-foreground hover:text-foreground">
                <X className="size-3.5" />
              </button>
            </li>
          ))}
          <li className="flex items-center">
            <label className="text-muted-foreground flex items-center gap-1.5 text-xs">
              <input type="checkbox" checked={original} onChange={(e) => setOriginal(e.target.checked)} className="accent-primary" />
              Original quality
            </label>
          </li>
        </ul>
      )}
      <div className="flex items-end gap-2">
        <input ref={fileInput} type="file" accept={ACCEPT} multiple className="sr-only" tabIndex={-1} aria-label="Attach files" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
        <Button type="button" variant="ghost" size="icon" disabled={items.length >= LIMITS.maxFiles} onClick={() => fileInput.current?.click()} aria-label="Attach a file" className="size-11 shrink-0 rounded-full md:size-9">
          <Paperclip />
        </Button>
        <label htmlFor="message-input" className="sr-only">
          Message
        </label>
        {preview && (
          <div className="bg-background min-h-10 min-w-0 flex-1 rounded-xl border px-3.5 py-2" aria-live="polite" data-testid="message-preview">
            {text.trim() ? <ChatMarkdown text={text} /> : <p className="text-muted-foreground text-sm">Nothing to preview yet.</p>}
          </div>
        )}
        <textarea
          ref={area}
          id="message-input"
          rows={1}
          value={text}
          maxLength={LIMITS.maxBody}
          placeholder={`Message ${firstName}`}
          enterKeyHint="send"
          autoComplete="off"
          onChange={(e) => {
            setText(e.target.value);
            engine.setDraft(conversationId, e.target.value);
            if (e.target.value) engine.announceTyping(conversationId);
          }}
          onKeyDown={onKeyDown}
          hidden={preview}
          className="bg-muted placeholder:text-muted-foreground focus-visible:ring-ring/40 max-h-[10.5rem] min-h-11 min-w-0 flex-1 resize-none rounded-3xl border border-transparent px-4 py-2.5 text-base outline-none focus-visible:ring-[3px] md:min-h-10 md:text-sm"
        />
        {text.trim() && (
          <Button type="button" variant="ghost" size="icon" onClick={() => setPreview((v) => !v)} aria-pressed={preview} aria-label={preview ? "Back to writing" : "Preview how it will look"} className="shrink-0">
            {preview ? <PencilIcon /> : <Eye />}
          </Button>
        )}
        <span className="hidden sm:block"><FormattingHelp /></span>
        <Button type="submit" size="icon" disabled={!canSend} aria-label="Send message" className="size-11 shrink-0 rounded-full md:size-9">
          {/* The paper plane flies off once for each message that is actually sent. */}
          {busy ? <Loader2 className="animate-spin" /> : <AnimatedIcon name="send" size={24} pulse={sent} />}
        </Button>
      </div>
      {text.length > LIMITS.maxBody - 500 && (
        <p className={cn("mt-1 text-right text-[11px]", text.length >= LIMITS.maxBody ? "text-destructive" : "text-muted-foreground")} aria-live="polite">
          {LIMITS.maxBody - text.length} characters left
        </p>
      )}
      {imageEditor}
    </form>
  );
}
