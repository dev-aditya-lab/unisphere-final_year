"use client";

import { useEffect } from "react";
import Link from "next/link";
import { SystemPage } from "@/components/system-page";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ error, reset }) {
  useEffect(() => {
    // Surfaced to the server logs / monitoring; the digest ties it to the server-side error.
    console.error("[app error]", error?.digest ?? "", error?.message);
  }, [error]);

  return (
    <SystemPage
      code="Something went wrong"
      title="That did not work"
      actions={
        <>
          <Button onClick={() => reset()}>Try again</Button>
          <Button asChild variant="outline">
            <Link href="/">Go home</Link>
          </Button>
        </>
      }
    >
      <p>An unexpected error occurred. Your data is safe. Please try again, and contact support if it keeps happening.</p>
      {error?.digest && <p className="font-mono text-xs">Reference: {error.digest}</p>}
    </SystemPage>
  );
}
