"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, Copy, MessageCircle, Send, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildShareText, shareTargets } from "@/lib/referrals/core";
import { useCanShare } from "@/lib/referrals/use-can-share";
import { cn } from "@/lib/utils";

/**
 * Copy, native share and one-tap targets for the member's real invite link. Every target is a plain link that opens the other
 * app, so it works the same in a browser, the installed PWA and the Android TWA. Nothing is posted for the member, and the page
 * never claims a friend was invited: sharing is only an action the member takes.
 */
export function SharePanel({ url, disabled = false }) {
  const [copied, setCopied] = useState(false);
  const canShare = useCanShare();
  const input = useRef(null);
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard API refused (insecure context, or the TWA denied it): select the text so Ctrl/Cmd+C or long-press works.
      input.current?.focus();
      input.current?.select();
      if (!document.execCommand?.("copy")) {
        toast.message("Press and hold the link to copy it.");
        return;
      }
    }
    setCopied(true);
    toast.success("Invite link copied.");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2500);
  }

  async function nativeShare() {
    const text = buildShareText(url);
    try {
      await navigator.share({ title: "Join me on UniSphere", text: text.slice(0, text.length - url.length).trim(), url });
    } catch (err) {
      if (err?.name !== "AbortError") toast.error("Sharing is not available here. Copy the link instead.");
    }
  }

  const targets = shareTargets(url);
  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="invite-link" className="text-muted-foreground mb-1.5 block text-xs font-semibold">Your invite link</label>
        <div className="flex gap-2">
          <input
            id="invite-link"
            ref={input}
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
            className="border-input bg-card focus-visible:ring-ring/30 h-11 min-w-0 flex-1 rounded-lg border px-3 font-mono text-[13px] outline-none focus-visible:ring-[3px]"
            data-testid="invite-link"
          />
          <Button type="button" onClick={copy} disabled={disabled} className="h-11 shrink-0" data-testid="copy-link">
            {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <p className="sr-only" role="status" aria-live="polite">{copied ? "Invite link copied" : ""}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {canShare && (
          <Button type="button" variant="secondary" onClick={nativeShare} disabled={disabled} data-testid="native-share">
            <Share2 aria-hidden="true" /> Share…
          </Button>
        )}
        {targets.map((t) => (
          <a
            key={t.id}
            href={disabled ? undefined : t.href}
            target={t.id === "email" || t.id === "sms" ? undefined : "_blank"}
            rel="noopener noreferrer"
            aria-disabled={disabled || undefined}
            data-testid={`share-${t.id}`}
            className={cn(
              "border-input bg-card hover:bg-accent focus-visible:ring-ring/45 inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold outline-none focus-visible:ring-[3px]",
              t.id === "whatsapp" && "border-[#25d366]",
              disabled && "pointer-events-none opacity-50",
            )}
          >
            {t.id === "whatsapp" ? <MessageCircle className="size-4 text-[#128c7e] dark:text-[#4ade80]" aria-hidden="true" /> : t.id === "telegram" ? <Send className="size-4" aria-hidden="true" /> : null}
            {t.label}
            <span className="sr-only">{t.id === "email" || t.id === "sms" ? "" : " (opens in a new tab)"}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
