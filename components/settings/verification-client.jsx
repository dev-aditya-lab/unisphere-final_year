"use client";

import { useRouter } from "next/navigation";
import { VerificationPanel } from "@/components/settings/verification-panel";

/** Thin wrapper that refreshes server data after a verification step completes. */
export function VerificationClient(props) {
  const router = useRouter();
  return <VerificationPanel {...props} refresh={() => router.refresh()} />;
}
