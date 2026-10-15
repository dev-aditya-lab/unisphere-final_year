"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FlipHorizontal2, FlipVertical2, Loader2, RotateCcw, RotateCw, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import {
  SIZE_PRESETS,
  clamp,
  fitRect,
  formatBytes,
  moveRect,
  normalisedRatio,
  resizeFromCorner,
  resizeFromEdge,
  rotatedSize,
  scaleRect,
} from "@/lib/images/geometry";
import { canEncodeWebp, drawPreview, exportImage, exportSize, fileFromBlob, loadImage } from "@/lib/images/process";
import { cn } from "@/lib/utils";

const DEFAULT_ASPECTS = [
  { id: "free", label: "Free", value: null },
  { id: "original", label: "Original", value: "original" },
  { id: "1:1", label: "1:1", value: 1 },
  { id: "4:3", label: "4:3", value: 4 / 3 },
  { id: "3:2", label: "3:2", value: 3 / 2 },
  { id: "16:9", label: "16:9", value: 16 / 9 },
];

const FORMATS = [
  { id: "image/jpeg", label: "JPG" },
  { id: "image/webp", label: "WebP" },
  { id: "image/png", label: "PNG" },
];

const NEUTRAL = { brightness: 100, contrast: 100, saturation: 100 };
const HANDLE_POS = {
  nw: "left-0 top-0 cursor-nwse-resize",
  ne: "left-full top-0 cursor-nesw-resize",
  sw: "left-0 top-full cursor-nesw-resize",
  se: "left-full top-full cursor-nwse-resize",
  n: "left-1/2 top-0 cursor-ns-resize",
  s: "left-1/2 top-full cursor-ns-resize",
  w: "left-0 top-1/2 cursor-ew-resize",
  e: "left-full top-1/2 cursor-ew-resize",
};

function Segmented({ label, children, className }) {
  return (
    <div role="group" aria-label={label} className={cn("flex flex-wrap gap-1.5", className)}>
      {children}
    </div>
  );
}

function Choice({ active, disabled, onClick, children }) {
  return (
    <Button type="button" size="sm" variant={active ? "default" : "outline"} aria-pressed={active} disabled={disabled} onClick={onClick}>
      {children}
    </Button>
  );
}

function Section({ title, children }) {
  return (
    <section className="space-y-2.5">
      <h3 className="text-muted-foreground text-xs font-semibold">{title}</h3>
      {children}
    </section>
  );
}

/**
 * Crop, rotate, flip, adjust and resize one image, then hand back a File. Everything happens in the browser; the
 * server still validates whatever is uploaded. Props:
 *  - aspect / lockAspect: start (or fix) the crop shape, e.g. 1 for avatars and 3 for 3:1 covers
 *  - shape: "round" shows a circular crop guide (avatars)
 *  - sizes: size presets for the longest edge; defaultSize picks one
 *  - maxBytes: the upload limit; the result is checked against it
 */
export function ImageEditor({ file, options = {}, position, onApply, onUseOriginal, onCancel }) {
  const { aspect: startAspect = null, lockAspect = false, shape = "rect", sizes = SIZE_PRESETS, defaultSize = "large", maxBytes = 5 * 1024 * 1024, aspects = DEFAULT_ASPECTS, title = "Edit image" } = options;

  const [source, setSource] = useState(null); // { img, url }
  const [failed, setFailed] = useState(false);
  const [turns, setTurns] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [aspect, setAspect] = useState(startAspect); // null | number | "original"
  const [crop, setCrop] = useState({ x: 0, y: 0, w: 1, h: 1 });
  const [adjust, setAdjust] = useState(NEUTRAL);
  const [sizeId, setSizeId] = useState(defaultSize);
  const [format, setFormat] = useState(() => (file.type === "image/jpeg" ? "image/jpeg" : canEncodeWebp() ? "image/webp" : "image/png"));
  const [quality, setQuality] = useState(0.85);
  const [estimate, setEstimate] = useState(null);
  const [busy, setBusy] = useState(false);

  const stageBox = useRef(null);
  const canvasRef = useRef(null);
  const stageRef = useRef(null);
  const drag = useRef(null);
  const [display, setDisplay] = useState({ w: 0, h: 0 });
  const [avail, setAvail] = useState({ w: 0, h: 0 });

  const edge = sizes.find((s) => s.id === sizeId)?.edge ?? null;
  const img = source?.img;
  const T = img ? rotatedSize(img.naturalWidth, img.naturalHeight, turns) : { w: 1, h: 1 };
  const pixelAspect = aspect === "original" ? T.w / T.h : aspect;
  const ar = pixelAspect ? normalisedRatio(pixelAspect, T.w, T.h) : null;

  // Decode the picked file.
  useEffect(() => {
    let alive = true;
    let url = null;
    loadImage(file)
      .then((res) => {
        url = res.url;
        if (!alive) return URL.revokeObjectURL(res.url);
        // The first crop is the largest one of the requested shape.
        const w = res.img.naturalWidth;
        const h = res.img.naturalHeight;
        const pa = startAspect === "original" ? w / h : startAspect;
        setCrop(fitRect(pa ? normalisedRatio(pa, w, h) : null));
        setSource(res);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [file, startAspect]);

  // How much room the preview has.
  useEffect(() => {
    const el = stageBox.current;
    if (!el) return;
    const measure = () => setAvail({ w: Math.max(160, el.clientWidth - 24), h: Math.max(180, Math.min(window.innerHeight * 0.5, 480)) });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [source]);

  // Redraw the preview when the picture, its orientation or the room changes.
  useEffect(() => {
    if (!img || !canvasRef.current || !avail.w) return;
    setDisplay(drawPreview(canvasRef.current, img, { turns, flipH, flipV }, avail.w, avail.h));
  }, [img, turns, flipH, flipV, avail]);

  // Exact size of the file that would be saved. Debounced because encoding is the slow part.
  const state = { turns, flipH, flipV, crop, adjust, edge, format, quality };
  const stateKey = JSON.stringify([turns, flipH, flipV, crop, adjust, edge, format, quality]);
  useEffect(() => {
    if (!img) return;
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const [t, fh, fv, c, a, e, f, q] = JSON.parse(stateKey);
        const res = await exportImage(img, { turns: t, flipH: fh, flipV: fv, crop: c, adjust: a, edge: e, format: f, quality: q });
        if (alive) setEstimate({ bytes: res.blob.size, width: res.width, height: res.height, type: res.blob.type });
      } catch {
        if (alive) setEstimate(null);
      }
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [img, stateKey]);

  const refit = useCallback(
    (nextAspect, nextTurns) => {
      if (!img) return;
      const t = rotatedSize(img.naturalWidth, img.naturalHeight, nextTurns);
      const pa = nextAspect === "original" ? t.w / t.h : nextAspect;
      setCrop(fitRect(pa ? normalisedRatio(pa, t.w, t.h) : null));
    },
    [img],
  );

  function rotate(dir) {
    const next = (turns + dir + 4) % 4;
    setTurns(next);
    refit(aspect, next);
  }
  function chooseAspect(value) {
    setAspect(value);
    refit(value, turns);
  }
  function reset() {
    setTurns(0);
    setFlipH(false);
    setFlipV(false);
    setAdjust(NEUTRAL);
    setAspect(startAspect);
    setSizeId(defaultSize);
    setQuality(0.85);
    if (img) {
      const pa = startAspect === "original" ? img.naturalWidth / img.naturalHeight : startAspect;
      setCrop(fitRect(pa ? normalisedRatio(pa, img.naturalWidth, img.naturalHeight) : null));
    }
  }

  // Pointer dragging for the crop box and its handles.
  function begin(e, mode) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { mode, rect: stageRef.current.getBoundingClientRect(), start: crop, sx: e.clientX, sy: e.clientY };
  }
  function onMove(e) {
    const d = drag.current;
    if (!d) return;
    const px = clamp((e.clientX - d.rect.left) / d.rect.width, 0, 1);
    const py = clamp((e.clientY - d.rect.top) / d.rect.height, 0, 1);
    if (d.mode === "move") setCrop(moveRect(d.start, (e.clientX - d.sx) / d.rect.width, (e.clientY - d.sy) / d.rect.height));
    else if (d.mode.length === 2) setCrop(resizeFromCorner(d.start, d.mode, px, py, ar));
    else setCrop(resizeFromEdge(d.start, d.mode, px, py));
  }
  function end() {
    drag.current = null;
  }
  function onKey(e) {
    const step = e.shiftKey ? 0.05 : 0.01;
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[e.key]) {
      e.preventDefault();
      setCrop((c) => moveRect(c, ...moves[e.key]));
    } else if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      setCrop((c) => scaleRect(c, 1.06));
    } else if (e.key === "-" || e.key === "_") {
      e.preventDefault();
      setCrop((c) => scaleRect(c, 0.94));
    }
  }

  async function apply() {
    if (!img) return;
    setBusy(true);
    try {
      const res = await exportImage(img, state);
      onApply(fileFromBlob(res.blob, file.name));
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  const lossy = format !== "image/png";
  const cropped = img ? exportSize(img, state) : null;
  const longest = cropped ? Math.max(cropped.crop.w, cropped.crop.h) : 0;
  const tooBig = estimate && estimate.bytes > maxBytes;
  const edited = turns !== 0 || flipH || flipV || adjust !== NEUTRAL || crop.x > 0.0005 || crop.y > 0.0005 || crop.w < 0.9995 || crop.h < 0.9995;
  const round = shape === "round";
  const freeShape = !ar;

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-h-[94dvh] overflow-y-auto sm:max-w-4xl" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>
            {title}
            {position && position.total > 1 ? ` (${position.index + 1} of ${position.total})` : ""}
          </DialogTitle>
          <DialogDescription className="truncate">{file.name}</DialogDescription>
        </DialogHeader>

        {failed ? (
          <div className="space-y-3 py-6 text-center">
            <p className="text-sm">This image could not be opened for editing.</p>
            <div className="flex justify-center gap-2">
              <Button type="button" variant="outline" onClick={onCancel}>
                Skip
              </Button>
              <Button type="button" onClick={onUseOriginal}>
                Use it as it is
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_17.5rem]">
            <div>
              <div ref={stageBox} className="bg-muted flex min-h-56 items-center justify-center rounded-xl border p-3">
                {!img && <Loader2 className="text-muted-foreground size-6 animate-spin" aria-label="Loading image" />}
                <div
                  ref={stageRef}
                  className={cn("relative touch-none overflow-hidden select-none", !img && "hidden")}
                  style={{ width: display.w || undefined, height: display.h || undefined }}
                >
                  <canvas ref={canvasRef} aria-hidden="true" className="block size-full" style={{ filter: `brightness(${adjust.brightness}%) contrast(${adjust.contrast}%) saturate(${adjust.saturation}%)` }} />
                  {/* The crop box. Everything outside it is dimmed by its huge outer shadow. */}
                  <div
                    role="group"
                    tabIndex={0}
                    aria-label="Crop area"
                    aria-describedby="crop-help"
                    onKeyDown={onKey}
                    onPointerDown={(e) => begin(e, "move")}
                    onPointerMove={onMove}
                    onPointerUp={end}
                    onPointerCancel={end}
                    className={cn(
                      "focus-visible:ring-ring absolute cursor-move border-2 border-white shadow-[0_0_0_9999px_rgb(0_0_0/0.55)] outline-none focus-visible:ring-4",
                      round && "rounded-full",
                    )}
                    style={{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.w * 100}%`, height: `${crop.h * 100}%` }}
                  >
                    {!round && (
                      <>
                        <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-1/3 w-px bg-white/45" />
                        <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-2/3 w-px bg-white/45" />
                        <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-1/3 h-px bg-white/45" />
                        <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-2/3 h-px bg-white/45" />
                      </>
                    )}
                    {Object.keys(HANDLE_POS)
                      .filter((h) => h.length === 2 || freeShape)
                      .map((h) => (
                        <span
                          key={h}
                          aria-hidden="true"
                          onPointerDown={(e) => begin(e, h)}
                          className={cn("absolute flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center", HANDLE_POS[h])}
                        >
                          <span className="size-3.5 rounded-[4px] border-2 border-white bg-black/70 shadow" />
                        </span>
                      ))}
                  </div>
                </div>
              </div>
              <p id="crop-help" className="text-muted-foreground mt-2 text-xs">
                Drag the box to move it and the handles to resize. With the keyboard: arrow keys move, + and - resize.
              </p>
            </div>

            <div className="space-y-5">
              {!lockAspect && (
                <Section title="Crop shape">
                  <Segmented label="Crop shape">
                    {aspects.map((a) => (
                      <Choice key={a.id} active={aspect === a.value} onClick={() => chooseAspect(a.value)}>
                        {a.label}
                      </Choice>
                    ))}
                  </Segmented>
                </Section>
              )}

              <Section title="Rotate and flip">
                <div className="flex gap-1.5">
                  <Button type="button" variant="outline" size="icon-sm" aria-label="Rotate left" title="Rotate left" onClick={() => rotate(-1)}>
                    <RotateCcw />
                  </Button>
                  <Button type="button" variant="outline" size="icon-sm" aria-label="Rotate right" title="Rotate right" onClick={() => rotate(1)}>
                    <RotateCw />
                  </Button>
                  <Button type="button" variant="outline" size="icon-sm" aria-label="Flip horizontally" aria-pressed={flipH} title="Flip horizontally" onClick={() => setFlipH((v) => !v)}>
                    <FlipHorizontal2 />
                  </Button>
                  <Button type="button" variant="outline" size="icon-sm" aria-label="Flip vertically" aria-pressed={flipV} title="Flip vertically" onClick={() => setFlipV((v) => !v)}>
                    <FlipVertical2 />
                  </Button>
                  <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={reset}>
                    <Undo2 /> Reset
                  </Button>
                </div>
              </Section>

              <Section title="Adjust">
                {[
                  ["brightness", "Brightness"],
                  ["contrast", "Contrast"],
                  ["saturation", "Saturation"],
                ].map(([key, label]) => (
                  <div key={key} className="grid grid-cols-[5.5rem_1fr] items-center gap-2">
                    <label className="text-sm" id={`adj-${key}`}>
                      {label}
                    </label>
                    <Slider aria-labelledby={`adj-${key}`} min={50} max={150} step={1} value={[adjust[key]]} onValueChange={([v]) => setAdjust((a) => ({ ...a, [key]: v }))} />
                  </div>
                ))}
              </Section>

              <Section title="Image size">
                <Segmented label="Image size">
                  {sizes.map((s) => {
                    const disabled = s.edge !== null && cropped && s.edge >= longest;
                    return (
                      <Choice key={s.id} active={sizeId === s.id} disabled={disabled} onClick={() => setSizeId(s.id)}>
                        {s.edge ? `${s.label} · ${s.edge}px` : s.label}
                      </Choice>
                    );
                  })}
                </Segmented>
                <Segmented label="File format">
                  {FORMATS.filter((f) => f.id !== "image/webp" || canEncodeWebp()).map((f) => (
                    <Choice key={f.id} active={format === f.id} onClick={() => setFormat(f.id)}>
                      {f.label}
                    </Choice>
                  ))}
                </Segmented>
                {lossy && (
                  <div className="grid grid-cols-[5.5rem_1fr] items-center gap-2">
                    <label className="text-sm" id="adj-quality">
                      Quality {Math.round(quality * 100)}%
                    </label>
                    <Slider aria-labelledby="adj-quality" min={40} max={100} step={5} value={[Math.round(quality * 100)]} onValueChange={([v]) => setQuality(v / 100)} />
                  </div>
                )}
              </Section>

              <p className={cn("rounded-lg border p-2.5 text-sm", tooBig ? "border-destructive text-destructive-text" : "bg-muted")} aria-live="polite">
                {estimate ? (
                  <>
                    <strong>
                      {estimate.width} × {estimate.height} px
                    </strong>{" "}
                    · about {formatBytes(estimate.bytes)}
                    {tooBig && <span className="mt-1 block text-xs">That is over the {formatBytes(maxBytes)} limit. Choose a smaller size or lower the quality.</span>}
                  </>
                ) : (
                  "Calculating size…"
                )}
              </p>
            </div>
          </div>
        )}

        {!failed && (
          <DialogFooter className="sm:items-center">
            <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
              Cancel
            </Button>
            <Button type="button" variant="outline" onClick={onUseOriginal} disabled={busy}>
              Use original
            </Button>
            <Button type="button" onClick={apply} disabled={!img || busy || tooBig}>
              {busy ? <Loader2 className="animate-spin" /> : null}
              {edited ? "Save edits" : "Use image"}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
