"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, Copy, Download, Loader2, RotateCw, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const FORMATS = [
  { value: "story", label: "Story 9:16" },
  { value: "square", label: "Square 1:1" },
];

/**
 * Orbit Card: previews, downloads or shares an image built from real data (`spec` comes from buildCardSpec). The drawing
 * code is loaded only when the dialog opens. Nothing is posted anywhere automatically: a device share sheet or a download
 * is always the member's own action, and the message says only that the sheet was opened, never that it was shared.
 */
export function ShareCardButton({ spec, filename = "orbit-card", label = "Share", url = null, variant = "outline", size = "sm" }) {
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState("story");
  const [status, setStatus] = useState("idle"); // idle | drawing | ready | error
  const [note, setNote] = useState(null);
  const canvasRef = useRef(null);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const draw = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setStatus("drawing");
    try {
      const { drawCard } = await import("@/lib/orbits/card-canvas");
      const font = getComputedStyle(document.body).fontFamily || "system-ui, sans-serif";
      await drawCard(canvas, spec, format, font);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [spec, format]);

  useEffect(() => {
    if (!open) return;
    // wait a frame so the dialog's canvas is mounted
    const t = requestAnimationFrame(() => draw());
    return () => cancelAnimationFrame(t);
  }, [open, draw]);

  async function blob() {
    const { canvasToBlob } = await import("@/lib/orbits/card-canvas");
    return canvasToBlob(canvasRef.current);
  }

  async function download() {
    try {
      const b = await blob();
      const href = URL.createObjectURL(b);
      const a = document.createElement("a");
      a.href = href;
      a.download = `${filename}-${format}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(href), 4000);
      setNote("Image saved to your downloads.");
    } catch {
      toast.error("Could not create the image. Try again.");
    }
  }

  async function share() {
    try {
      const b = await blob();
      const file = new File([b], `${filename}-${format}.png`, { type: "image/png" });
      const data = navigator.canShare?.({ files: [file] }) ? { files: [file], text: spec.shareText } : { text: spec.shareText, ...(url ? { url } : {}) };
      await navigator.share(data);
      setNote("Your device's share sheet was opened.");
    } catch (err) {
      if (err?.name !== "AbortError") toast.error("Sharing is not available here. Use Download instead.");
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url ?? spec.shareText);
      setNote(url ? "Link copied." : "Text copied.");
    } catch {
      toast.error("Could not copy. Select the text yourself instead.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} size={size}>
          <Share2 /> {label}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Orbit Card</DialogTitle>
          <DialogDescription>Preview it, then save or share it yourself. Nothing is posted for you.</DialogDescription>
        </DialogHeader>

        <div role="radiogroup" aria-label="Card format" className="bg-muted flex rounded-xl p-1">
          {FORMATS.map((f) => (
            <button
              key={f.value}
              type="button"
              role="radio"
              aria-checked={format === f.value}
              onClick={() => setFormat(f.value)}
              className={cn("focus-visible:ring-ring/40 h-8 flex-1 rounded-lg text-[13px] font-semibold transition-colors outline-none focus-visible:ring-[3px]", format === f.value ? "bg-card shadow-sm" : "text-muted-foreground")}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="bg-muted/50 relative grid place-items-center overflow-hidden rounded-xl border p-2" aria-busy={status === "drawing"}>
          <canvas ref={canvasRef} className={cn("h-auto max-h-[52dvh] w-auto max-w-full rounded-lg shadow-sm", status !== "ready" && "opacity-30")} aria-label={`Preview: ${spec.headline}. ${spec.sub}`} role="img" />
          {status === "drawing" && <Loader2 className="text-muted-foreground absolute size-6 animate-spin" aria-label="Preparing the card" />}
          {status === "error" && (
            <div role="alert" className="absolute inset-0 grid place-content-center gap-2 p-4 text-center text-sm">
              <p className="text-destructive-text">The card could not be drawn.</p>
              <Button size="sm" variant="outline" onClick={draw}><RotateCw /> Try again</Button>
            </div>
          )}
        </div>

        <p className="text-muted-foreground text-xs">{spec.shareText}</p>
        {note && <p role="status" className="text-success-text flex items-center gap-1.5 text-xs font-medium"><Check className="size-3.5" aria-hidden="true" /> {note}</p>}

        <div className="flex flex-wrap gap-2">
          <Button onClick={download} disabled={status !== "ready"}><Download /> Download</Button>
          {canShare && <Button variant="outline" onClick={share} disabled={status !== "ready"}><Share2 /> Share…</Button>}
          <Button variant="ghost" onClick={copy}><Copy /> {url ? "Copy link" : "Copy text"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
