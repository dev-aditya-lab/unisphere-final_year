"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IdCard, Paperclip } from "lucide-react";
import { CircleAlert, Clock, Lock, ShieldCheck } from "@/components/icons/lucide-compat";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { BlueTick } from "@/components/ui/blue-tick";
import { FormAlert } from "@/components/forms/form-alert";
import { useImageEditor } from "@/components/images/use-image-editor";
import { confirmBlueTickPaymentAction, startBlueTickPurchaseAction, submitBlueTickDocumentAction } from "@/lib/actions/blue-tick";
import { uploadFileWithProgress } from "@/lib/storage/client";
import { setConsentAction } from "@/lib/actions/privacy";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { formatInr } from "@/lib/blue-tick";

const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

function loadCheckout() {
  if (typeof window !== "undefined" && window.Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = CHECKOUT_SRC;
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
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
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function buy() {
    setError(null);
    setBusy(true);
    const started = await startBlueTickPurchaseAction();
    if (!started.ok) {
      setError(started.error);
      setBusy(false);
      return;
    }
    const loaded = await loadCheckout();
    if (!loaded || !window.Razorpay) {
      setError("The payment window could not be loaded. Check your connection and try again.");
      setBusy(false);
      return;
    }
    const checkout = new window.Razorpay({
      key: started.keyId,
      order_id: started.orderId,
      amount: started.amountPaise,
      currency: "INR",
      name: "UniSphere",
      description: "Blue tick, one-time payment",
      prefill: started.prefill,
      theme: { color: "#1a8cd8" },
      modal: { ondismiss: () => setBusy(false) },
      handler: async (response) => {
        const res = await confirmBlueTickPaymentAction({
          orderId: response.razorpay_order_id,
          paymentId: response.razorpay_payment_id,
          signature: response.razorpay_signature,
        });
        setBusy(false);
        if (res.ok) {
          toast.success("Payment received. Now send your ID.");
          router.refresh();
        } else setError(res.error);
      },
    });
    checkout.on("payment.failed", (response) => {
      setError(response?.error?.description ? `The payment failed: ${response.error.description}` : "The payment failed. You have not been charged.");
      setBusy(false);
    });
    checkout.open();
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
      <p className="text-muted-foreground text-xs">Payments are processed by Razorpay. UniSphere never sees or stores your card, UPI or bank details.</p>
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

export function BlueTickPanel({ hasTick, application, order, config, documentConsent = false }) {
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
