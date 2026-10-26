"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IdCard, Paperclip } from "lucide-react";
import { CircleAlert, Clock, Lock, ShieldCheck } from "@/components/icons/lucide-compat";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { BlueTick } from "@/components/ui/blue-tick";
import { FormAlert } from "@/components/forms/form-alert";
import { useImageEditor } from "@/components/images/use-image-editor";
import { startBlueTickPurchaseAction, submitBlueTickDocumentAction } from "@/lib/actions/blue-tick";
import { uploadFileWithProgress } from "@/lib/storage/client";
import { setConsentAction } from "@/lib/actions/privacy";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { BLUE_TICK_PATH, PAYMENT_RETURN_PATH, formatInr } from "@/lib/blue-tick";

/**
 * Send the member to the payment gateway's own page: open an address, or post the small form the gateway asked for. The server
 * has already checked that it is an https address. Nothing from the gateway is loaded into this page.
 */
function goToCheckout(checkout) {
  if (checkout?.type === "redirect" && /^https?:\/\//.test(checkout.url)) {
    window.location.assign(checkout.url);
    return true;
  }
  if (checkout?.type === "form" && /^https?:\/\//.test(checkout.action)) {
    const form = document.createElement("form");
    form.method = checkout.method === "GET" ? "GET" : "POST";
    form.action = checkout.action;
    form.hidden = true;
    for (const [name, value] of Object.entries(checkout.fields ?? {})) {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      input.value = value;
      form.appendChild(input);
    }
    document.body.appendChild(form);
    form.submit();
    return true;
  }
  return false;
}

const NOTICES = {
  done: { tone: "ok", text: "Payment received. Now send your ID." },
  duplicate: { tone: "ok", text: "You already had a blue tick in progress, so this second payment was refunded." },
  pending: { tone: "wait", text: "Your payment has not been confirmed yet. If you were charged, it is applied here automatically, usually within a few minutes." },
  failed: { tone: "bad", text: "The payment was not completed, so you have not been charged. You can try again." },
};

/** What happened when the member came back from the payment page. Shown once; the address is then cleaned up. */
function PaymentNotice({ notice, orderId }) {
  const router = useRouter();
  // Both are kept from the first render, because the address (and so the props) is cleaned up right after.
  const [shown] = useState(notice);
  const [shownOrder] = useState(orderId);
  useEffect(() => {
    if (shown) router.replace(BLUE_TICK_PATH, { scroll: false });
  }, [shown, router]);
  const info = NOTICES[shown];
  if (!info) return null;
  return (
    <div role={info.tone === "bad" ? "alert" : "status"} className="flex items-start gap-2 rounded-md border px-3 py-2 text-sm">
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>
        {info.text}
        {shown === "pending" && shownOrder && (
          <>
            {" "}
            <a href={`${PAYMENT_RETURN_PATH}?o=${shownOrder}`} className="font-semibold underline underline-offset-2">Check again</a>
          </>
        )}
      </span>
    </div>
  );
}

function Steps({ current }) {
  const steps = [
    { id: "pay", label: "Pay once" },
    { id: "id", label: "Send your ID" },
    { id: "review", label: "Admin review" },
  ];
  const index = steps.findIndex((s) => s.id === current);
  return (
    <ol className="mb-6 grid grid-cols-3 gap-2 text-center text-xs font-semibold" aria-label="Progress">
      {steps.map((s, i) => (
        <li
          key={s.id}
          aria-current={i === index ? "step" : undefined}
          className={`rounded-md border px-2 py-2 ${i < index ? "bg-muted text-muted-foreground" : i === index ? "border-primary text-foreground" : "text-muted-foreground"}`}
        >
          <span className="block text-[11px] font-medium tracking-wide uppercase">Step {i + 1}</span>
          {s.label}
        </li>
      ))}
    </ol>
  );
}

function BuyStep({ config }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // Coming back with the browser's Back button restores this page as it was, still "opening"; make the button usable again.
  useEffect(() => {
    const onShow = (e) => {
      if (e.persisted) setBusy(false);
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  async function buy() {
    setError(null);
    setBusy(true);
    const started = await startBlueTickPurchaseAction();
    if (!started.ok) {
      setError(started.error);
      setBusy(false);
      return;
    }
    // The page is replaced by the payment gateway's, so on success the button simply stays busy until that happens.
    if (!goToCheckout(started.checkout)) {
      setError("The payment page could not be opened. Please try again.");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Steps current="pay" />
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="font-heading text-3xl font-extrabold tabular-nums">{formatInr(config.pricePaise)}</p>
        <p className="text-muted-foreground text-sm">one-time payment, no subscription, no renewal</p>
      </div>
      <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
        <li>A blue tick next to your name on posts, comments, people lists and your profile.</li>
        <li>It is given after an administrator checks a valid ID document against your name.</li>
        <li>If we cannot verify you, your payment is refunded.</li>
      </ul>
      {error && <FormAlert>{error}</FormAlert>}
      {config.open ? (
        <Button onClick={buy} disabled={busy}>
          <Lock aria-hidden="true" /> {busy ? "Opening payment…" : `Pay ${formatInr(config.pricePaise)} securely`}
        </Button>
      ) : (
        <p className="bg-muted rounded-md px-3 py-2 text-sm">The blue tick is not on sale right now. Please check back later.</p>
      )}
      <p className="text-muted-foreground text-xs">You pay on the payment gateway&apos;s own secure page. UniSphere never sees or stores your card, UPI or bank details.</p>
    </div>
  );
}

function DocumentStep({ application, consented }) {
  const router = useRouter();
  const fileRef = useRef(null);
  const { editImages, imageEditor } = useImageEditor();
  const [doc, setDoc] = useState(null);
  const [agreed, setAgreed] = useState(Boolean(consented));
  const [savingConsent, setSavingConsent] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [pending, startTransition] = useTransition();

  // Agreeing (and un-agreeing) is saved on the server straight away; un-agreeing also deletes any document already sent.
  async function changeConsent(next) {
    setError(null);
    setSavingConsent(true);
    const res = await setConsentAction({ purpose: "identity_verification", granted: next, source: "application" });
    setSavingConsent(false);
    if (res.ok) {
      setAgreed(next);
      if (!next) setDoc(null);
      router.refresh();
    } else setError(res.error);
  }

  async function onPick(e) {
    const picked = e.target.files?.[0];
    e.target.value = "";
    if (!picked) return;
    const [file] = await editImages([picked], { title: "Crop your ID" });
    if (!file) return;
    setError(null);
    setUploading(true);
    const up = await uploadFileWithProgress(file, "verification_document");
    setUploading(false);
    if (up.ok) setDoc({ id: up.fileId, name: file.name });
    else setError(up.error);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await submitBlueTickDocumentAction({ applicationId: application.id, fileId: doc.id });
      if (res.ok) {
        toast.success(res.message);
        router.refresh();
      } else setError(res.error);
    });
  }

  return (
    <div className="space-y-4">
      <Steps current="id" />
      {application.rejection_reason && (
        <div role="alert" className="border-destructive/40 bg-destructive/5 rounded-md border px-3 py-2 text-sm">
          <p className="font-semibold">Your last document was not accepted</p>
          <p className="text-muted-foreground mt-0.5 break-words whitespace-pre-wrap">{application.rejection_reason}</p>
        </div>
      )}
      <p className="text-sm">Your payment is complete. Send a clear photo or PDF of your <strong>Aadhaar card</strong> so an administrator can confirm it is really you.</p>
      <div className="bg-muted rounded-md px-3 py-2 text-sm">
        <p className="flex items-center gap-1.5 font-semibold"><ShieldCheck className="size-4" aria-hidden="true" /> Protect your Aadhaar number</p>
        <ul className="text-muted-foreground mt-1 list-disc space-y-1 pl-5">
          <li>Use a <strong>masked Aadhaar</strong> (the first 8 digits hidden), which you can download from the UIDAI website. We only need your name and photo.</li>
          <li>The name on the card must match the name on your profile.</li>
          <li>Only administrators can open it. It is deleted as soon as a decision is made, and it is never shown on your profile.</li>
        </ul>
      </div>
      {error && <FormAlert>{error}</FormAlert>}
      <div className="flex items-start gap-2.5 rounded-md border p-3">
        <Checkbox id="idConsent" checked={agreed} disabled={savingConsent} onCheckedChange={(v) => changeConsent(v === true)} className="mt-0.5" />
        <Label htmlFor="idConsent" className="text-[13px] leading-snug font-normal">
          I agree that UniSphere reviewers may open the identity document I upload, only to compare my name and photo with my profile for the blue tick. It is deleted when they decide. I can untick this at any time, which deletes the document.
        </Label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only" onChange={onPick} aria-label="Choose your ID document" />
        <Button type="button" variant="outline" disabled={!agreed || uploading || pending} onClick={() => fileRef.current?.click()}>
          <Paperclip aria-hidden="true" /> {uploading ? "Uploading…" : doc ? "Replace document" : "Choose document"}
        </Button>
        {doc && <span className="text-muted-foreground truncate text-xs">{doc.name}</span>}
      </div>
      <Button onClick={submit} disabled={!agreed || !doc || uploading || pending}>
        <IdCard aria-hidden="true" /> {pending ? "Sending…" : "Send for review"}
      </Button>
      {imageEditor}
    </div>
  );
}

export function BlueTickPanel({ notice = null, noticeOrder = null, ...props }) {
  // The notice sits first and keeps its place whichever step is showing, so it survives the page refreshing underneath it.
  return (
    <div className="space-y-4">
      <PaymentNotice notice={notice} orderId={noticeOrder} />
      <BlueTickSteps {...props} />
    </div>
  );
}

function BlueTickSteps({ hasTick, application, order, config, documentConsent = false }) {
  if (hasTick) {
    return (
      <div className="flex items-start gap-3">
        <BlueTick className="mt-0.5 size-8" />
        <div>
          <p className="font-heading text-lg font-bold">You have the blue tick</p>
          <p className="text-muted-foreground text-sm">It shows next to your name across UniSphere. Thank you for supporting the community.</p>
        </div>
      </div>
    );
  }
  if (application?.status === "awaiting_document") return <DocumentStep application={application} consented={documentConsent} />;
  if (application?.status === "pending_review") {
    return (
      <div className="space-y-4">
        <Steps current="review" />
        <p className="flex items-start gap-2 text-sm">
          <Clock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>Your document is with an administrator. You will see the blue tick here and on your profile once it is approved. If it cannot be verified, your payment is refunded.</span>
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {application?.status === "refunded" && (
        <p className="flex items-start gap-2 rounded-md border px-3 py-2 text-sm">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>Your last payment was refunded{order?.amount_paise ? ` (${formatInr(order.amount_paise)})` : ""}. You can apply again.</span>
        </p>
      )}
      <BuyStep config={config} />
    </div>
  );
}
