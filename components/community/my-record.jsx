"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppealDialog } from "@/components/community/dialogs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { APPEALABLE, MOD_ACTION_LABEL } from "@/lib/community/rules";

const fmt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" });
const WINDOW_MS = 30 * 24 * 3600 * 1000;

/** What moderators have done to the signed-in member here, why, and whether they can still ask for a second look. */
export function MyRecord({ decisions }) {
  const router = useRouter();
  const [appealing, setAppealing] = useState(null);
  const [now] = useState(() => Date.now()); // fixed at the first render so the 30-day window does not flicker
  if (!decisions.length) return null;
  return (
    <section className="surface space-y-3 p-4" aria-labelledby="my-record">
      <h2 id="my-record" className="text-sm font-bold">Moderator decisions about you in this community</h2>
      <ul className="divide-y text-sm">
        {decisions.map((d) => {
          const canAppeal = APPEALABLE.has(d.action) && !d.appeal && now - new Date(d.created_at).getTime() < WINDOW_MS;
          return (
            <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
              <strong>{MOD_ACTION_LABEL[d.action] ?? d.action}</strong>
              <span className="text-muted-foreground text-xs">{fmt.format(new Date(d.created_at))}{d.expires_at ? ` · until ${fmt.format(new Date(d.expires_at))}` : ""}</span>
              {d.appeal ? <Badge variant="mono" className="capitalize">Appeal {d.appeal.status}</Badge> : null}
              {canAppeal && <Button size="xs" variant="outline" className="ml-auto" onClick={() => setAppealing(d.id)}>Appeal</Button>}
              {d.reason && <span className="text-muted-foreground w-full text-xs">Reason: {d.reason}</span>}
              {d.appeal?.review_note && <span className="text-muted-foreground w-full text-xs">Reviewer: {d.appeal.review_note}</span>}
            </li>
          );
        })}
      </ul>
      {appealing && <AppealDialog open onOpenChange={(o) => !o && setAppealing(null)} actionId={appealing} onDone={() => router.refresh()} />}
    </section>
  );
}
