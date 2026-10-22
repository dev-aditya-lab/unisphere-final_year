import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Gift } from "@/components/icons/lucide-compat";
import { REFERRAL_REWARD } from "@/lib/referrals/core";

/** The compact way into Refer & Earn from the Orbits page. A plain link: it shows no number it could get wrong. */
export function ReferralOrbitsEntry() {
  return (
    <Link
      href="/referrals"
      data-testid="referral-entry"
      className="surface hover:border-ring focus-visible:ring-ring/45 group flex items-center gap-3 border-[var(--orbit-line)] p-4 outline-none transition-colors focus-visible:ring-[3px]"
    >
      <span aria-hidden="true" className="bg-primary-soft text-primary-text grid size-11 shrink-0 place-items-center rounded-xl">
        <Gift className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold">Invite friends. Earn {REFERRAL_REWARD} Orbits.</span>
        <span className="text-muted-foreground block text-xs">For each friend who joins and becomes an active member.</span>
      </span>
      <ArrowRight className="text-muted-foreground size-4 shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
    </Link>
  );
}
