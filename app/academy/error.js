"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

// A friendly fallback for anything that throws on an Academy page. The rest of the page chrome (header, footer) stays.
export default function AcademyError({ error, reset }) {
  useEffect(() => {
    console.error("[academy error]", error?.digest ?? "", error?.message);
  }, [error]);
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-24 text-center" role="alert">
      <p className="ac-kicker">Something went wrong</p>
      <h1 className="ac-display mt-3 text-4xl">That page did not load</h1>
      <p className="text-muted-foreground mt-3">Your progress and payments are safe. Please try again, and write to us if it keeps happening.</p>
      {error?.digest && <p className="text-muted-foreground mt-2 text-xs font-semibold">Reference: {error.digest}</p>}
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button onClick={() => reset()}>Try again</Button>
        <Button asChild variant="outline"><Link href="/academy">Academy home</Link></Button>
      </div>
    </div>
  );
}
