"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Lock, ShieldCheck, TicketPercent, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { quoteAction, startCheckoutAction } from "@/lib/actions/academy";
import { formatMoney, inclusiveTaxNote, quoteLines } from "@/lib/academy/money";

const field = "border-input bg-card h-10 w-full rounded-lg border px-3 text-sm";

/**
 * The order summary and the Pay button. Every figure shown comes back from the server (the first from the page, the rest from
 * quoteAction); this component never adds anything up, and the server works the total out again when the order is created.
 */
export function CheckoutPanel({ courseId, cohorts, initialQuote, canPay, blocker }) {
  const router = useRouter();
  const [quote, setQuote] = useState(initialQuote);
  const [cohortId, setCohortId] = useState(cohorts[0]?.id ?? "");
  const [coupon, setCoupon] = useState("");
  const [applied, setApplied] = useState(null);
  const [couponError, setCouponError] = useState(null);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState(null);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const live = useRef(null);

  const free = quote?.total_minor === 0 || quote?.free;
  const lines = quoteLines(quote);
  const note = inclusiveTaxNote(quote);

  function requote(nextCoupon, nextCohort = cohortId) {
    setCouponError(null);
    startTransition(async () => {
      const res = await quoteAction({ courseId, cohortId: nextCohort || null, coupon: nextCoupon || null });
      if (res.ok) {
        setQuote(res.quote);
        setApplied(nextCoupon ? res.quote.coupon?.code ?? null : null);
      } else if (nextCoupon) {
        setCouponError(res.error);
        setApplied(null);
      } else setError(res.error);
    });
  }

  async function pay() {
    setError(null);
    setBusy(true);
    const res = await startCheckoutAction({ courseId, cohortId: cohortId || null, coupon: applied, consent });
    if (!res.ok) {
      setBusy(false);
      setError(res.fieldErrors?.consent ?? res.error);
      live.current?.focus();
      return;
    }
    if (res.enrolled) return router.push(`/academy/my-learning?welcome=1`);
    // A plain navigation to our own handover page, which sends the browser to the payment provider's page.
    window.location.assign(res.checkoutUrl);
  }

  return (
    <div className="space-y-5">
      {cohorts.length > 0 && (
        <div>
          <label htmlFor="cohort" className="text-sm font-semibold">Cohort</label>
          <select id="cohort" value={cohortId} onChange={(e) => { setCohortId(e.target.value); requote(applied, e.target.value); }} className={`${field} mt-1.5`}>
            {cohorts.map((c) => <option key={c.id} value={c.id}>{c.name}{c.starts_at ? ` · starts ${new Date(c.starts_at).toLocaleDateString("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" })}` : ""}</option>)}
          </select>
        </div>
      )}

      {!free && (
        <div>
          <label htmlFor="coupon" className="text-sm font-semibold">Coupon code <span className="text-muted-foreground font-normal">(optional)</span></label>
          {applied ? (
            <div className="bg-success-soft mt-1.5 flex items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold text-[var(--success-text)]">
              <span className="inline-flex items-center gap-2"><TicketPercent className="size-4" aria-hidden />{applied} applied</span>
              <button type="button" onClick={() => { setCoupon(""); requote(null); }} className="inline-flex items-center gap-1 text-xs underline" aria-label={`Remove coupon ${applied}`}><X className="size-3.5" aria-hidden />Remove</button>
            </div>
          ) : (
            <div className="mt-1.5 flex gap-2">
              <input id="coupon" value={coupon} onChange={(e) => setCoupon(e.target.value.toUpperCase())} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (coupon.trim()) requote(coupon.trim()); } }} placeholder="e.g. WELCOME10" autoComplete="off" spellCheck={false} maxLength={40} className={`${field} font-mono uppercase`} aria-invalid={Boolean(couponError) || undefined} aria-describedby="coupon-msg" />
              <Button type="button" variant="outline" disabled={!coupon.trim() || pending} onClick={() => requote(coupon.trim())}>{pending ? "Checking…" : "Apply"}</Button>
            </div>
          )}
          <p id="coupon-msg" role="status" className={couponError ? "text-destructive-text mt-1.5 text-sm" : "sr-only"}>{couponError}</p>
        </div>
      )}

      <div className="bg-muted/60 rounded-xl p-4" aria-live="polite">
        <h3 className="sr-only">Order summary</h3>
        <dl className="space-y-2 text-sm">
          {lines.map((l) => (
            <div key={l.key} className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{l.label}{l.note && <span className="text-xs"> · {l.note}</span>}</dt>
              <dd className={`tabular-nums ${l.minor < 0 ? "text-[var(--success-text)]" : ""}`}>{l.minor < 0 ? "−" : ""}{formatMoney(Math.abs(l.minor), { withZero: true })}</dd>
            </div>
          ))}
          <div className="flex justify-between gap-4 border-t pt-3 text-base font-bold">
            <dt>Total to pay</dt>
            <dd className="tabular-nums" data-testid="total">{free ? "Free" : formatMoney(quote?.total_minor, { withZero: true })}</dd>
          </div>
        </dl>
        {note && <p className="text-muted-foreground mt-2 text-xs">{note}</p>}
      </div>

      <div className="flex items-start gap-3">
        <Checkbox id="consent" checked={consent} onCheckedChange={(v) => setConsent(v === true)} className="mt-0.5" />
        <label htmlFor="consent" className="text-sm leading-snug">
          I agree to the <a className="text-primary-text underline" href="/terms#academy" target="_blank" rel="noopener">terms</a>, and that my name and this course appear on the public verification page if a certificate is issued to me.
        </label>
      </div>

      <div ref={live} tabIndex={-1} role="alert" aria-live="assertive" className={error ? "bg-destructive-soft text-destructive-text rounded-lg px-3 py-2 text-sm font-medium" : "sr-only"}>{error}</div>
      {blocker && !free && <p className="bg-muted rounded-lg px-3 py-2 text-sm" role="status">{blocker}</p>}

      <Button type="button" size="lg" className="w-full rounded-full" disabled={!consent || busy || pending || (!free && !canPay)} onClick={pay}>
        {busy ? "Please wait…" : free ? <><CheckCircle2 aria-hidden />Enrol for free</> : <><Lock aria-hidden />Pay {formatMoney(quote?.total_minor, { withZero: true })}</>}
      </Button>
      <p className="text-muted-foreground flex items-center justify-center gap-1.5 text-center text-xs"><ShieldCheck className="size-3.5" aria-hidden />{free ? "No payment needed." : "You pay on your payment provider's secure page. We never see your card or UPI details."}</p>
    </div>
  );
}
