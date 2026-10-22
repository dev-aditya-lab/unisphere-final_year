"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCw } from "lucide-react";
import { CircleAlert } from "@/components/icons/lucide-compat";
import { Button } from "@/components/ui/button";

/** If anything on a Refer & Earn page fails to render, the member sees this instead of a blank screen. Their referrals and Orbits are untouched. */
export default function ReferralsError({ error, reset }) {
  useEffect(() => {
    console.error("[referrals page]", error?.digest ?? "", error?.message);
  }, [error]);

  return (
    <div role="alert" className="surface mx-auto mt-6 flex max-w-md flex-col items-center gap-3 px-6 py-12 text-center">
      <CircleAlert className="text-destructive-text size-8" aria-hidden="true" />
      <p className="font-semibold">Refer &amp; Earn hit a problem.</p>
      <p className="text-muted-foreground text-sm">Nothing was lost: your referrals and Orbits are safe. Please try again.</p>
      {error?.digest && <p className="text-muted-foreground text-xs">Reference: {error.digest}</p>}
      <div className="flex gap-2">
        <Button onClick={() => reset()}><RotateCw /> Try again</Button>
        <Button asChild variant="outline"><Link href="/orbits">Back to Orbits</Link></Button>
      </div>
    </div>
  );
}
