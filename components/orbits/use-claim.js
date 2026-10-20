"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { claimCheckinAction } from "@/lib/actions/orbits";
import { burstFrom } from "@/components/orbits/fx";
import { publishGlance, useGlance } from "@/lib/orbits/glance-store";

/**
 * Claiming the Daily Orbit Bonus, shared by every place that offers it (Orbits page, feed widget, mobile strip).
 *
 * The server decides: the button only asks. Celebration (confetti, the "+5" chip, the toast) happens only when the response says
 * `claimed: true`, so a second click, a second tab or a replay can never celebrate a reward that was not paid. The new balance
 * comes back with the confirmation and is published to every widget on the page without a reload.
 */
export function useClaimCheckin(initialClaimed = false) {
  const router = useRouter();
  const glance = useGlance();
  const [local, setLocal] = useState(false);
  const [gain, setGain] = useState(null); // { amount, id } after a confirmed claim
  const [error, setError] = useState(null);
  const [pending, startTransition] = useTransition();
  const busy = useRef(false);
  const claimed = local || initialClaimed || Boolean(glance?.checkin?.claimed_today);

  function claim(sourceEl) {
    if (busy.current || claimed) return;
    busy.current = true;
    setError(null);
    startTransition(async () => {
      let res;
      try {
        res = await claimCheckinAction();
      } catch {
        res = { ok: false, error: "We could not reach UniSphere. Check your connection and try again." };
      }
      busy.current = false;
      if (!res.ok) return setError(res.error);
      setLocal(true);
      publishGlance(res.data.glance);
      if (res.data.claimed) {
        setGain({ amount: res.data.amount, id: Date.now() });
        burstFrom(sourceEl, { count: 46 });
        toast.success(`You earned +${res.data.amount} Orbits!`);
      }
      router.refresh();
    });
  }

  return { claimed, claim, pending, error, gain };
}
