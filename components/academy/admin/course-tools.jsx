"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FileUpload } from "@/components/academy/file-upload";
import { adminQuoteAction, addResourceAction, setCourseCoverAction } from "@/lib/actions/academy-admin";
import { formatMoney, formatBps } from "@/lib/academy/money";

/** Upload a cover picture and attach it to the course. The database checks the picture is a ready cover upload. */
export function CoverUpload({ courseId }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <FileUpload
      purpose="academy_cover" label="Upload cover image" accept="image/png,image/jpeg,image/webp" disabled={pending} hint="16:9 works best. JPG, PNG or WebP."
      onChange={(f) => f && start(async () => {
        const res = await setCourseCoverAction(courseId, f.key);
        if (res.ok) { toast.success(res.message); router.refresh(); } else toast.error(res.error);
      })}
    />
  );
}

/** Attach a downloadable file (PDF or image) to the course, or to one lesson. Enrolled students and staff can open it; nobody else. */
export function ResourceUploader({ courseId, lessons = [] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [lessonId, setLessonId] = useState("");
  const [file, setFile] = useState(null);
  const [error, setError] = useState(null);
  const [pending, start] = useTransition();
  function add(e) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await addResourceAction({ course_id: courseId, lesson_id: lessonId, title, file_id: file.fileId });
      if (res.ok) { toast.success(res.message); setTitle(""); setFile(null); router.refresh(); } else setError(res.fieldErrors?.title ?? res.error);
    });
  }
  return (
    <form onSubmit={add} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label htmlFor="res-title" className="text-[13px] font-semibold">Title</label><input id="res-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} className="border-input bg-card mt-1 h-9 w-full rounded-md border px-3 text-sm" /></div>
        <div><label htmlFor="res-lesson" className="text-[13px] font-semibold">For</label>
          <select id="res-lesson" value={lessonId} onChange={(e) => setLessonId(e.target.value)} className="border-input bg-card mt-1 h-9 w-full rounded-md border px-2 text-sm"><option value="">The whole course</option>{lessons.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}</select></div>
      </div>
      <FileUpload purpose="academy_resource" onChange={setFile} label="Choose file" hint="PDF or image, up to 10 MB." />
      <p role="alert" className={error ? "text-destructive-text text-sm" : "sr-only"}>{error}</p>
      <Button type="submit" size="sm" disabled={pending || !file || title.trim().length < 2}>Add resource</Button>
    </form>
  );
}

/** The pricing preview: what a course costs, for a chosen coupon, student and moment. It creates nothing. */
export function PricePreview({ courses }) {
  const [form, setForm] = useState({ courseId: courses[0]?.id ?? "", coupon: "", username: "", at: "" });
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [pending, start] = useTransition();
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  function run(e) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await adminQuoteAction({ ...form, at: form.at ? new Date(form.at).toISOString() : "" });
      if (!res.ok) { setResult(null); return setError(res.error); }
      setResult(res.quote);
    });
  }
  const money = (n) => formatMoney(n, { withZero: true });
  const msg = { coupon_invalid: "Coupon is not valid for this student.", coupon_expired: "Coupon expired at that time.", coupon_not_started: "Coupon not active yet at that time.", coupon_not_eligible: "Coupon does not apply to this course.", coupon_no_stack: "Coupon cannot be combined with the sale price.", coupon_min_spend: "Below the coupon's minimum.", coupon_exhausted: "Coupon fully used.", coupon_user_limit: "This student has used it the most times allowed.", coupon_first_purchase: "Not a first purchase for this student.", coupon_not_needed: "Already free.", sign_in_required: "A student is needed to test a coupon.", price_not_set: "The course has no price yet." };
  return (
    <form onSubmit={run} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><label htmlFor="pp-course" className="text-[13px] font-semibold">Course</label><select id="pp-course" value={form.courseId} onChange={(e) => set("courseId", e.target.value)} className="border-input bg-card mt-1 h-9 w-full rounded-md border px-2 text-sm">{courses.map((c) => <option key={c.id} value={c.id}>{c.code} {c.title} ({c.status})</option>)}</select></div>
        <div><label htmlFor="pp-coupon" className="text-[13px] font-semibold">Coupon code</label><input id="pp-coupon" value={form.coupon} onChange={(e) => set("coupon", e.target.value.toUpperCase())} className="border-input bg-card mt-1 h-9 w-full rounded-md border px-3 font-mono text-sm" /></div>
        <div><label htmlFor="pp-user" className="text-[13px] font-semibold">As this student (username)</label><input id="pp-user" value={form.username} onChange={(e) => set("username", e.target.value)} placeholder="optional" className="border-input bg-card mt-1 h-9 w-full rounded-md border px-3 text-sm" /></div>
        <div><label htmlFor="pp-at" className="text-[13px] font-semibold">At this moment</label><input id="pp-at" type="datetime-local" value={form.at} onChange={(e) => set("at", e.target.value)} className="border-input bg-card mt-1 h-9 w-full rounded-md border px-3 text-sm" /></div>
      </div>
      <Button type="submit" size="sm" disabled={pending || !form.courseId}>{pending ? "Working it out…" : "Preview the price"}</Button>
      <p role="alert" className={error ? "text-destructive-text text-sm" : "sr-only"}>{error}</p>
      {result && (
        <div className="bg-muted/60 rounded-lg p-4 text-sm" aria-live="polite">
          {result.ok === false ? <p className="font-semibold">{msg[result.error] ?? `Not possible: ${result.error}`}</p> : (
            <dl className="max-w-sm space-y-1.5">
              <div className="flex justify-between"><dt>List price</dt><dd className="tabular-nums">{money(result.list_minor)}</dd></div>
              {result.sale && <div className="flex justify-between"><dt>{result.sale.label}</dt><dd className="tabular-nums">−{money(result.sale.discount_minor)}</dd></div>}
              {result.coupon && <div className="flex justify-between"><dt>Coupon {result.coupon.code}</dt><dd className="tabular-nums">−{money(result.coupon.discount_minor)}</dd></div>}
              <div className="flex justify-between"><dt>Subtotal</dt><dd className="tabular-nums">{money(result.net_minor)}</dd></div>
              {result.tax.minor > 0 && <div className="flex justify-between"><dt>{result.tax.label} ({formatBps(result.tax.rate_bps)}{result.tax.included ? ", included" : ""})</dt><dd className="tabular-nums">{money(result.tax.minor)}</dd></div>}
              <div className="flex justify-between border-t pt-2 font-bold"><dt>Student pays</dt><dd className="tabular-nums">{money(result.total_minor)}</dd></div>
            </dl>
          )}
        </div>
      )}
    </form>
  );
}
