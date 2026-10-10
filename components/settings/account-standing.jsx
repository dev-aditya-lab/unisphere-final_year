import { AppealForm } from "@/components/settings/appeal-form";
import { StatusBadge, fmtDate } from "@/components/admin/ui";

const LABEL = {
  warn: "You received a warning",
  remove_content: "Your content was removed",
  restrict: "Your account was restricted",
  suspend: "Your account was suspended",
};

/**
 * Moderation decisions about the signed-in member, each with its appeal state.
 * `current` limits restriction/suspension appeals to the decision that is still in force.
 */
export function AccountStanding({ items, accountStatus }) {
  if (items.length === 0) return null;
  return (
    <ul className="divide-y text-left">
      {items.map((a) => {
        const stillInForce = a.action === "warn" || a.action === "remove_content" || ["restricted", "suspended"].includes(accountStatus);
        const canAppeal = !a.appeal && stillInForce && a.withinWindow;
        return (
          <li key={a.id} className="space-y-2 py-4 first:pt-0 last:pb-0">
            <p className="text-sm font-semibold">{LABEL[a.action] ?? a.action} <span className="text-muted-foreground font-normal">· {fmtDate(a.created_at)}</span></p>
            {a.reason && <p className="text-muted-foreground text-sm break-words whitespace-pre-wrap">“{a.reason}”</p>}
            {a.appeal ? (
              <p className="text-sm">
                Appeal <StatusBadge value={a.appeal.status} />
                {a.appeal.review_note && <span className="text-muted-foreground"> — {a.appeal.review_note}</span>}
              </p>
            ) : canAppeal ? (
              <AppealForm actionId={a.id} />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
