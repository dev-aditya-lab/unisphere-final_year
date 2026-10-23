"use client";

import { useEffect } from "react";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function SettingsError({ error, reset }) {
  useEffect(() => {
    console.error("[community] settings failed to render:", error?.digest ?? error?.message);
  }, [error]);
  return (
    <div className="surface mx-auto max-w-xl space-y-3 p-6 text-center" role="alert">
      <p className="font-heading text-lg font-bold">This page could not be shown</p>
      <p className="text-muted-foreground text-sm">Nothing was changed. Check your connection and try again.</p>
      <Button onClick={reset} variant="outline"><RotateCw /> Try again</Button>
    </div>
  );
}
