"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";

const SHAPE = /^[A-Za-z0-9]{2,6}-\d{4}-[A-Za-z0-9]{1,8}-\d{4,8}$/;

/** A box for a certificate ID. It only navigates to the verification page; the server decides what the ID means. */
export function VerifyForm({ initial = "", tone = "light" }) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [error, setError] = useState(null);
  function submit(e) {
    e.preventDefault();
    const id = value.trim().toUpperCase();
    if (!SHAPE.test(id)) return setError("Enter the ID printed on the certificate, like US-2026-WD-00142.");
    setError(null);
    router.push(`/academy/verify/${encodeURIComponent(id)}`);
  }
  return (
    <form onSubmit={submit} className="w-full max-w-xl" noValidate>
      <label htmlFor="cert-id" className={tone === "dark" ? "text-sm font-semibold text-[#e3e8f3]" : "text-sm font-semibold"}>Certificate ID</label>
      <div className="mt-2 flex gap-2">
        <input
          id="cert-id" value={value} onChange={(e) => setValue(e.target.value)} placeholder="US-2026-WD-00142" autoComplete="off" spellCheck={false} maxLength={40}
          aria-invalid={Boolean(error) || undefined} aria-describedby={error ? "cert-id-error" : undefined}
          className="border-input bg-card text-foreground h-11 min-w-0 flex-1 rounded-lg border px-3 font-mono text-sm uppercase placeholder:normal-case"
        />
        <Button type="submit" size="lg" className={tone === "dark" ? "bg-[#ffffff] text-[#0b132b] hover:bg-white" : undefined}><Search aria-hidden />Verify</Button>
      </div>
      <p id="cert-id-error" role="alert" className={error ? "mt-2 text-sm font-medium text-[#ff9aa2]" : "sr-only"}>{error}</p>
    </form>
  );
}
