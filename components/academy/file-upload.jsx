"use client";

import { useRef, useState } from "react";
import { FileUp, Loader2, Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Sends one file to /api/upload for the given purpose and reports the stored file's id. The server decides what the file really is
 * (its first bytes, never its name or the type the browser claims), its size limit and who may upload for that purpose; this only
 * gives quick feedback. `accept` is a hint for the file picker.
 */
export function FileUpload({ purpose, onChange, accept = "application/pdf,image/png,image/jpeg,image/webp", label = "Attach a file", hint, disabled = false }) {
  const input = useRef(null);
  const [state, setState] = useState({ busy: false, name: null, error: null });

  async function pick(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setState({ busy: true, name: file.name, error: null });
    try {
      const body = new FormData();
      body.set("purpose", purpose);
      body.set("file", file);
      const res = await fetch("/api/upload", { method: "POST", body });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error || "The upload failed.");
      setState({ busy: false, name: file.name, error: null });
      onChange?.({ fileId: json.fileId, key: json.key, name: file.name, size: json.size });
    } catch (err) {
      setState({ busy: false, name: null, error: err.message });
      onChange?.(null);
    } finally {
      if (input.current) input.current.value = "";
    }
  }

  function clear() {
    setState({ busy: false, name: null, error: null });
    onChange?.(null);
  }

  return (
    <div>
      <input ref={input} type="file" accept={accept} onChange={pick} className="sr-only" id={`up-${purpose}`} disabled={disabled || state.busy} />
      {state.name && !state.error ? (
        <div className="bg-muted inline-flex max-w-full items-center gap-2 rounded-lg px-3 py-2 text-sm">
          {state.busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Paperclip className="size-4" aria-hidden />}
          <span className="truncate">{state.name}</span>
          {!state.busy && <button type="button" onClick={clear} aria-label="Remove the file" className="hover:text-destructive-text"><X className="size-4" /></button>}
        </div>
      ) : (
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => input.current?.click()}><FileUp aria-hidden />{label}</Button>
      )}
      {hint && !state.error && <p className="text-muted-foreground mt-1.5 text-xs">{hint}</p>}
      <p role="alert" className={state.error ? "text-destructive-text mt-1.5 text-sm" : "sr-only"}>{state.error}</p>
    </div>
  );
}
