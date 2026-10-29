"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, RotateCcw, Undo2, X } from "lucide-react";
import { Gift } from "@/components/icons/lucide-compat";
import { toast } from "sonner";
import { ActionDialog, QuickAction } from "@/components/admin/action-dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  grantBlueTickAction,
  refundBlueTickOrderAction,
  reviewBlueTickAction,
  revokeBlueTickAction,
  setBlueTickPricingAction,
} from "@/lib/actions/blue-tick";

const field = "border-input bg-card h-9 w-full rounded-md border px-2 text-sm";

/** Price (rupees) and the on/off switch. The server converts to paise and the database re-checks the limits. */
export function PricingForm({ enabled: initialEnabled, price: initialPrice, canManage, gatewayBlocking = null, gatewayWarning = null }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [price, setPrice] = useState(initialPrice);
  const [error, setError] = useState(null);
  const [pending, startTransition] = useTransition();
  const dirty = enabled !== initialEnabled || price !== initialPrice;

  function save(e) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await setBlueTickPricingAction({ enabled, price });
      if (res.ok) {
        toast.success(res.message);
        router.refresh();
      } else setError(res.fieldErrors?.price ?? res.error);
    });
  }

  return (
    <form onSubmit={save} className="space-y-4" noValidate>
      {(gatewayBlocking || gatewayWarning) && (
        <p role="status" className="bg-muted rounded-md px-3 py-2 text-sm">{gatewayBlocking ?? gatewayWarning}</p>
      )}
      <div className="grid gap-4 sm:grid-cols-[minmax(0,14rem)_1fr] sm:items-end">
        <div className="space-y-1.5">
          <label htmlFor="bt-price" className="text-[13px] font-semibold">One-time price (₹)</label>
          <input
            id="bt-price" inputMode="decimal" placeholder="e.g. 99" value={price} onChange={(e) => setPrice(e.target.value)} disabled={!canManage || pending}
            aria-describedby="bt-price-hint" aria-invalid={Boolean(error) || undefined} className={field}
          />
          <p id="bt-price-hint" className="text-muted-foreground text-xs">Between ₹1 and ₹1,00,000. Paid once, never renews. Applies to new purchases only.</p>
        </div>
        <div className="flex items-center gap-3">
          <Switch id="bt-enabled" checked={enabled} onCheckedChange={setEnabled} disabled={!canManage || pending} />
          <label htmlFor="bt-enabled" className="text-sm font-semibold">On sale</label>
        </div>
      </div>
      {error && <p role="alert" className="text-destructive-text text-sm">{error}</p>}
      {canManage ? (
        <Button type="submit" size="sm" disabled={!dirty || pending}>{pending ? "Saving…" : "Save pricing"}</Button>
      ) : (
        <p className="text-muted-foreground text-sm">You can view the pricing but not change it.</p>
      )}
    </form>
  );
}

/** Give a blue tick to any member, free of charge. A reason is required and goes in the audit log. */
export function GrantForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState(null);
  const [pending, startTransition] = useTransition();

  function submit(e) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await grantBlueTickAction({ username: username.replace(/^@/, ""), reason });
      if (res.ok) {
        toast.success(res.message);
        setUsername("");
        setReason("");
        router.refresh();
      } else setError(res.fieldErrors?.username ?? res.fieldErrors?.reason ?? res.error);
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[14rem_1fr_auto] sm:items-end" noValidate>
      <div className="space-y-1.5">
        <label htmlFor="grant-username" className="text-[13px] font-semibold">Exact username</label>
        <input id="grant-username" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="@username" className={field} />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="grant-reason" className="text-[13px] font-semibold">Reason (kept in the audit log)</label>
        <input id="grant-reason" placeholder="e.g. Student ID checked over email" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} className={field} />
      </div>
      <Button type="submit" size="sm" disabled={pending || username.trim().length < 3 || reason.trim().length < 3}>
        <Gift aria-hidden="true" /> {pending ? "Granting…" : "Give blue tick"}
      </Button>
      {error && <p role="alert" className="text-destructive-text text-sm sm:col-span-3">{error}</p>}
    </form>
  );
}

/** Review buttons for one application waiting on an administrator. */
export function ReviewActions({ id, orderId, canManage }) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-4">
      <QuickAction label="Approve" icon={Check} variant="default" action={reviewBlueTickAction} args={{ id, decision: "approve" }} successMessage="Approved. The blue tick is now on their profile." />
      <ActionDialog
        label="Send back" icon={Undo2} title="Ask for a new document"
        description="The document is deleted and the member sees your message. They keep their payment and can upload again."
        action={reviewBlueTickAction} args={{ id, decision: "reject" }} reasonLabel="What should they fix?"
      />
      {canManage && orderId && (
        <ActionDialog
          label="Reject and refund" icon={X} destructive title="Reject and refund the payment"
          description="The full amount goes back to the member through the payment gateway and the document is deleted. This cannot be undone."
          action={refundBlueTickOrderAction} args={{ orderId }} reasonLabel="Reason (kept in the audit log)"
          confirmLabel="Refund"
        />
      )}
    </div>
  );
}

export function RevokeButton({ userId }) {
  return (
    <ActionDialog
      label="Remove" icon={X} destructive title="Remove this blue tick"
      description="The badge disappears everywhere straight away. If it was paid for, refund the order separately from Payments."
      action={revokeBlueTickAction} args={{ userId }} reasonLabel="Reason (kept in the audit log)"
    />
  );
}

export function RefundButton({ orderId }) {
  return (
    <ActionDialog
      label="Refund" icon={RotateCcw} destructive title="Refund this payment"
      description="The full amount goes back to the payer through the payment gateway, and the blue tick is removed if it was approved."
      action={refundBlueTickOrderAction} args={{ orderId }} reasonLabel="Reason (kept in the audit log)"
      confirmLabel="Refund"
    />
  );
}
