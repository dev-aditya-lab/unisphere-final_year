"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Eye, Loader2, Move, Plus, QrCode, Trash2, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CERT_FONTS, CERT_VARIABLES, fillText, sampleData } from "@/lib/academy/cert-vars";
import { activateTemplateVersionAction, previewTemplateAction, saveTemplateFieldsAction } from "@/lib/actions/academy-admin";

/*
 * The certificate template editor. The uploaded PDF is drawn with pdf.js as a picture to place things on; the fields are an overlay
 * saved as fractions of the page (from its top-left corner), which is exactly how the server draws them over the original PDF when a
 * certificate is made. The PDF itself is never edited. "Test with sample data" asks the server to draw the real thing.
 */

const FONT_CSS = { Helvetica: "ui-sans-serif, Arial, sans-serif", HelveticaBold: "ui-sans-serif, Arial, sans-serif", HelveticaOblique: "ui-sans-serif, Arial, sans-serif", TimesRoman: "Georgia, 'Times New Roman', serif", TimesRomanBold: "Georgia, 'Times New Roman', serif", TimesRomanItalic: "Georgia, 'Times New Roman', serif", Courier: "ui-monospace, 'Courier New', monospace", CourierBold: "ui-monospace, 'Courier New', monospace" };
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const input = "border-input bg-card w-full rounded-md border px-2 text-sm";
const SAMPLE = sampleData();

let pdfjsPromise;
async function loadPdfjs() {
  pdfjsPromise ??= import("pdfjs-dist").then((m) => {
    m.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
    return m;
  });
  return pdfjsPromise;
}

/** Draw one page of a PDF (bytes) on a canvas at the given pixel width. Returns the CSS size used. */
async function drawPage(bytes, pageIndex, canvas, width) {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({ data: bytes.slice(0) }).promise;
  const page = await doc.getPage(Math.min(doc.numPages, pageIndex + 1));
  const base = page.getViewport({ scale: 1 });
  const scale = width / base.width;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const viewport = page.getViewport({ scale: scale * dpr });
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  canvas.style.width = `${Math.floor(viewport.width / dpr)}px`;
  canvas.style.height = `${Math.floor(viewport.height / dpr)}px`;
  await page.render({ canvasContext: canvas.getContext("2d"), viewport, canvas }).promise;
  return { w: viewport.width / dpr, h: viewport.height / dpr };
}

const b64ToBytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

export function TemplateEditor({ versionId, pageCount, pageWidth, pageHeight, initialFields, status }) {
  const router = useRouter();
  const locked = status !== "draft";
  const [fields, setFields] = useState(initialFields ?? []);
  const [selected, setSelected] = useState(null);
  const [page, setPage] = useState(0);
  const [placing, setPlacing] = useState(null);
  const [pdfBytes, setPdfBytes] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [size, setSize] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [preview, setPreview] = useState(null); // bytes of the server-drawn sample
  const [problems, setProblems] = useState([]);
  const [pending, start] = useTransition();
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const drag = useRef(null);
  const counter = useRef(fields.length + 1);

  const ratio = pageHeight / pageWidth;
  const sel = fields.find((f) => f.id === selected) ?? null;
  const update = useCallback((id, patch) => { setFields((fs) => fs.map((f) => (f.id === id ? { ...f, ...patch } : f))); setDirty(true); }, []);

  // Fetch the template PDF once (through our own server route: same origin, access checked there).
  useEffect(() => {
    let off = false;
    fetch(`/api/academy/templates/${versionId}/pdf`).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error("The template could not be loaded.")))).then((b) => !off && setPdfBytes(new Uint8Array(b))).catch((e) => !off && setLoadError(e.message));
    return () => { off = true; };
  }, [versionId]);

  // Draw the page (or the server-drawn sample) at the width available.
  useEffect(() => {
    const bytes = preview ?? pdfBytes;
    if (!bytes || !canvasRef.current || !wrapRef.current) return;
    let off = false;
    const width = Math.min(960, wrapRef.current.clientWidth);
    drawPage(bytes, page, canvasRef.current, width).then((s) => !off && setSize(s)).catch(() => !off && setLoadError("The PDF could not be drawn in this browser."));
    return () => { off = true; };
  }, [pdfBytes, preview, page]);

  function pointerPos(e) {
    const r = wrapRef.current.querySelector("[data-stage]").getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, rect: r };
  }

  function startDrag(e, f, mode) {
    if (locked || preview) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setSelected(f.id);
    const p = pointerPos(e);
    drag.current = { id: f.id, mode, dx: p.x - f.x, dy: p.y - f.y, startW: f.w, startX: p.x };
  }
  function moveDrag(e) {
    const d = drag.current;
    if (!d) return;
    const p = pointerPos(e);
    const f = fields.find((x) => x.id === d.id);
    if (!f) return;
    if (d.mode === "move") update(d.id, { x: clamp(p.x - d.dx, 0, 1 - f.w), y: clamp(p.y - d.dy, 0, 0.98) });
    else update(d.id, { w: clamp(d.startW + (p.x - d.startX), 0.04, 1 - f.x) });
  }
  const endDrag = () => { drag.current = null; };

  function place(e) {
    if (!placing || locked || preview) { setSelected(null); return; }
    const p = pointerPos(e);
    const id = `f${counter.current++}`;
    const base = { id, page, x: clamp(p.x, 0, 0.9), y: clamp(p.y, 0, 0.95) };
    const field = placing === "qr"
      ? { ...base, kind: "qr", w: 0.12 }
      : { ...base, kind: "text", w: 0.5, text: "{{student_name}}", font: "HelveticaBold", size: 28, color: "#111111", align: "left" };
    setFields((fs) => [...fs, field]);
    setSelected(id);
    setPlacing(null);
    setDirty(true);
  }

  function onKey(e, f) {
    if (locked || preview) return;
    const step = e.shiftKey ? 0.01 : 0.002;
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[e.key]) { e.preventDefault(); update(f.id, { x: clamp(f.x + moves[e.key][0], 0, 1 - f.w), y: clamp(f.y + moves[e.key][1], 0, 0.98) }); }
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); remove(f.id); }
  }
  function remove(id) { setFields((fs) => fs.filter((f) => f.id !== id)); setSelected(null); setDirty(true); }

  const clean = (fs) => fs.map((f) => (f.kind === "qr" ? { id: f.id, kind: "qr", page: f.page, x: +f.x.toFixed(4), y: +f.y.toFixed(4), w: +f.w.toFixed(4) } : { ...f, x: +f.x.toFixed(4), y: +f.y.toFixed(4), w: +f.w.toFixed(4), size: Number(f.size) }));

  function save() {
    setProblems([]);
    start(async () => {
      const res = await saveTemplateFieldsAction(versionId, clean(fields));
      if (res.ok) { toast.success(res.message); setDirty(false); router.refresh(); } else { toast.error(res.error); setProblems(res.problems ?? []); }
    });
  }
  function test() {
    start(async () => {
      const res = await previewTemplateAction(versionId, clean(fields));
      if (res.ok) setPreview(b64ToBytes(res.pdfBase64)); else toast.error(res.error);
    });
  }
  function activate() {
    setProblems([]);
    start(async () => {
      if (dirty) {
        const saved = await saveTemplateFieldsAction(versionId, clean(fields));
        if (!saved.ok) { toast.error(saved.error); return setProblems(saved.problems ?? []); }
        setDirty(false);
      }
      const res = await activateTemplateVersionAction(versionId);
      if (res.ok) { toast.success(res.message); router.refresh(); } else { toast.error(res.error); setProblems(res.problems ?? []); }
    });
  }

  const scale = size ? size.w / pageWidth : 0;
  const used = new Set(fields.flatMap((f) => (f.kind === "text" ? [...f.text.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]) : [])));

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
      <div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {!locked && !preview && (
            <>
              <Button type="button" size="sm" variant={placing === "text" ? "default" : "outline"} onClick={() => setPlacing(placing === "text" ? null : "text")}><Type aria-hidden />Add text</Button>
              <Button type="button" size="sm" variant={placing === "qr" ? "default" : "outline"} onClick={() => setPlacing(placing === "qr" ? null : "qr")}><QrCode aria-hidden />Add QR code</Button>
            </>
          )}
          {pageCount > 1 && (
            <label className="text-sm">Page <select value={page} onChange={(e) => { setPage(Number(e.target.value)); setSelected(null); }} className={`${input} inline-block h-8 w-auto`}>{Array.from({ length: pageCount }, (_, i) => <option key={i} value={i}>{i + 1} of {pageCount}</option>)}</select></label>
          )}
          <span className="ml-auto flex flex-wrap gap-2">
            {preview ? <Button type="button" size="sm" variant="outline" onClick={() => setPreview(null)}>Back to editing</Button> : <Button type="button" size="sm" variant="outline" disabled={pending} onClick={test}><Eye aria-hidden />Test with sample data</Button>}
            {!locked && <Button type="button" size="sm" disabled={pending || !dirty} onClick={save}>{pending ? "Saving…" : dirty ? "Save fields" : "Saved"}</Button>}
            {!locked && <Button type="button" size="sm" variant="default" disabled={pending || fields.length === 0} onClick={activate}>Activate this version</Button>}
          </span>
        </div>
        {placing && <p role="status" className="bg-muted mb-3 rounded-md px-3 py-2 text-sm">Click on the page where the {placing === "qr" ? "QR code" : "text"} should go.</p>}
        {preview && <p role="status" className="bg-muted mb-3 rounded-md px-3 py-2 text-sm">This is what the server draws for sample data (marked SAMPLE). Real certificates use the student&apos;s data and have no mark.</p>}
        {problems.length > 0 && <ul role="alert" className="bg-destructive-soft text-destructive-text mb-3 list-disc rounded-md py-2 pr-3 pl-7 text-sm">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
        {locked && <p className="bg-muted mb-3 rounded-md px-3 py-2 text-sm">This version is {status === "active" ? "live" : "archived"} and can no longer be edited: certificates already issued must stay reproducible. Upload a new version to change the layout.</p>}

        <div ref={wrapRef} className="bg-muted/50 overflow-auto rounded-xl border p-3">
          {loadError ? <p role="alert" className="text-destructive-text p-6 text-sm">{loadError}</p> : !pdfBytes ? <p className="text-muted-foreground flex items-center gap-2 p-6 text-sm"><Loader2 className="size-4 animate-spin" aria-hidden />Loading the template…</p> : (
            <div data-stage className="relative mx-auto shadow-lg" style={{ width: size?.w, height: size?.h ?? undefined, aspectRatio: size ? undefined : `1 / ${ratio}`, cursor: placing ? "crosshair" : "default" }} onPointerDown={place} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
              <canvas ref={canvasRef} className="block bg-white" aria-label="Certificate template page" />
              {!preview && size && fields.filter((f) => f.page === page).map((f) => {
                const active = f.id === selected;
                const isQr = f.kind === "qr";
                const { text } = isQr ? { text: "" } : fillText(f.text, SAMPLE);
                const boxW = f.w * size.w;
                return (
                  <div key={f.id} role="button" tabIndex={0} aria-label={isQr ? "QR code" : `Text: ${f.text}`} aria-pressed={active}
                    onPointerDown={(e) => startDrag(e, f, "move")} onKeyDown={(e) => onKey(e, f)} onFocus={() => setSelected(f.id)}
                    className={`absolute touch-none outline-offset-2 ${active ? "outline-2 outline-[var(--ring)]" : "outline-1 outline-dashed outline-[var(--ring)]/50 hover:outline-[var(--ring)]"}`}
                    style={{ left: `${f.x * 100}%`, top: `${f.y * 100}%`, width: boxW, height: isQr ? boxW : undefined, cursor: locked ? "default" : "move" }}>
                    {isQr ? <div className="grid size-full place-items-center bg-white/90"><QrCode className="size-3/4" aria-hidden /></div> : (
                      <div className="leading-tight break-words whitespace-pre-wrap" style={{ fontFamily: FONT_CSS[f.font], fontWeight: /Bold/.test(f.font) ? 700 : 400, fontStyle: /Oblique|Italic/.test(f.font) ? "italic" : "normal", fontSize: f.size * scale, color: f.color, textAlign: f.align, textTransform: f.uppercase ? "uppercase" : "none" }}>{text || <span className="opacity-40">(empty)</span>}</div>
                    )}
                    {active && !locked && <span onPointerDown={(e) => startDrag(e, f, "resize")} className="bg-[var(--ring)] absolute -right-1.5 -bottom-1.5 size-3 cursor-ew-resize rounded-full" aria-hidden />}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <p className="text-muted-foreground mt-2 text-xs">Drag a box to move it, drag its blue dot to change its width, or use the arrow keys (Shift for bigger steps). Text is previewed with sample data; the real PDF is drawn by the server over your original file.</p>
      </div>

      <aside className="surface h-fit p-4" aria-label="Field settings">
        {!sel ? (
          <div className="space-y-3 text-sm">
            <h3 className="font-heading text-base font-bold">Fields</h3>
            {fields.length === 0 ? <p className="text-muted-foreground">No fields yet. Choose Add text or Add QR code, then click the page.</p> : (
              <ul className="space-y-1">{fields.map((f) => <li key={f.id}><button type="button" onClick={() => { setSelected(f.id); setPage(f.page); }} className="hover:bg-muted flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left">{f.kind === "qr" ? <QrCode className="size-4 shrink-0" aria-hidden /> : <Type className="size-4 shrink-0" aria-hidden />}<span className="truncate">{f.kind === "qr" ? "QR code" : f.text}</span></button></li>)}</ul>
            )}
            <div className="border-t pt-3"><p className="text-muted-foreground text-xs">A certificate must include the QR code and the {"{{student_name}}"}, {"{{course_title}}"} and {"{{certificate_id}}"} fields before this version can be activated.</p></div>
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between"><h3 className="font-heading flex items-center gap-1.5 text-base font-bold"><Move className="size-4" aria-hidden />{sel.kind === "qr" ? "QR code" : "Text field"}</h3><Button type="button" size="sm" variant="ghost" onClick={() => setSelected(null)}>Done</Button></div>
            {sel.kind === "text" && (
              <>
                <div><label htmlFor="fe-text" className="text-[13px] font-semibold">Text</label><textarea id="fe-text" placeholder="Text shown on the certificate" rows={3} maxLength={400} disabled={locked} value={sel.text} onChange={(e) => update(sel.id, { text: e.target.value })} className={`${input} mt-1 py-2`} /></div>
                <div><p className="text-[13px] font-semibold">Insert a variable</p><div className="mt-1 flex flex-wrap gap-1">{CERT_VARIABLES.map((v) => <button key={v.key} type="button" disabled={locked} title={v.label} onClick={() => update(sel.id, { text: `${sel.text}{{${v.key}}}` })} className={`rounded-full border px-2 py-0.5 text-[11px] ${used.has(v.key) ? "bg-accent" : "hover:bg-muted"}`}>{v.key}{v.required ? "*" : ""}</button>)}</div><p className="text-muted-foreground mt-1 text-[11px]">* always filled in. Others print nothing when the student has no value.</p></div>
                <div className="grid grid-cols-2 gap-2">
                  <div><label htmlFor="fe-font" className="text-[13px] font-semibold">Font</label><select id="fe-font" disabled={locked} value={sel.font} onChange={(e) => update(sel.id, { font: e.target.value })} className={`${input} mt-1 h-8`}>{CERT_FONTS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}</select></div>
                  <div><label htmlFor="fe-size" className="text-[13px] font-semibold">Size (pt)</label><input id="fe-size" type="number" min={6} max={120} disabled={locked} value={sel.size} onChange={(e) => update(sel.id, { size: clamp(Number(e.target.value) || 6, 6, 120) })} className={`${input} mt-1 h-8`} /></div>
                  <div><label htmlFor="fe-align" className="text-[13px] font-semibold">Align</label><select id="fe-align" disabled={locked} value={sel.align} onChange={(e) => update(sel.id, { align: e.target.value })} className={`${input} mt-1 h-8`}><option value="left">Left</option><option value="center">Centre</option><option value="right">Right</option></select></div>
                  <div><label htmlFor="fe-color" className="text-[13px] font-semibold">Colour</label><input id="fe-color" type="color" disabled={locked} value={sel.color} onChange={(e) => update(sel.id, { color: e.target.value })} className={`${input} mt-1 h-8 p-0.5`} /></div>
                </div>
                <label className="flex items-center gap-2"><input type="checkbox" disabled={locked} checked={Boolean(sel.uppercase)} onChange={(e) => update(sel.id, { uppercase: e.target.checked })} className="accent-primary size-4" />Print in capitals</label>
                <label className="flex items-start gap-2"><input type="checkbox" disabled={locked} checked={Boolean(sel.required)} onChange={(e) => update(sel.id, { required: e.target.checked })} className="accent-primary mt-0.5 size-4" /><span>Required: do not issue if a variable here is empty</span></label>
              </>
            )}
            <div><label htmlFor="fe-w" className="text-[13px] font-semibold">{sel.kind === "qr" ? "Size" : "Width"} ({Math.round(sel.w * 100)}% of the page)</label><input id="fe-w" type="range" min={4} max={100} disabled={locked} value={Math.round(sel.w * 100)} onChange={(e) => update(sel.id, { w: clamp(Number(e.target.value) / 100, 0.04, 1 - sel.x) })} className="mt-1 w-full" /></div>
            {pageCount > 1 && <div><label htmlFor="fe-page" className="text-[13px] font-semibold">Page</label><select id="fe-page" disabled={locked} value={sel.page} onChange={(e) => { update(sel.id, { page: Number(e.target.value) }); setPage(Number(e.target.value)); }} className={`${input} mt-1 h-8`}>{Array.from({ length: pageCount }, (_, i) => <option key={i} value={i}>{i + 1}</option>)}</select></div>}
            {!locked && <Button type="button" size="sm" variant="outline" className="text-destructive-text" onClick={() => remove(sel.id)}><Trash2 aria-hidden />Delete field</Button>}
          </div>
        )}
        {!locked && !sel && <Button type="button" size="sm" variant="outline" className="mt-4" onClick={() => setPlacing("text")}><Plus aria-hidden />Add text</Button>}
      </aside>
    </div>
  );
}
