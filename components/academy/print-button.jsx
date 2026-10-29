"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintButton({ label = "Print this page" }) {
  return (
    <Button type="button" variant="outline" size="sm" onClick={() => window.print()}>
      <Printer aria-hidden />
      {label}
    </Button>
  );
}
