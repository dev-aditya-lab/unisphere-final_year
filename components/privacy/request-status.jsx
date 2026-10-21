import { Badge } from "@/components/ui/badge";
import { REQUEST_STATUS } from "@/lib/privacy/registry";

const fmt = (iso) => new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(iso));
export const fmtDate = (iso) => new Intl.DateTimeFormat("en-IN", { dateStyle: "long", timeZone: "Asia/Kolkata" }).format(new Date(iso));

export function RequestStatusBadge({ status }) {
  const s = REQUEST_STATUS[status];
  return <Badge variant={s?.tone ?? "mono"}>{s?.label ?? String(status).replace(/_/g, " ")}</Badge>;
}

/** The history the requester is allowed to see, oldest first. Staff-only notes never arrive here (row level security). */
export function RequestTimeline({ events }) {
  if (!events?.length) return null;
  return (
    <ol className="space-y-3" aria-label="History of this request">
      {events.map((e) => (
        <li key={e.id ?? `${e.at}-${e.status}`} className="border-l-2 pl-4">
          <p className="text-sm font-semibold">
            {REQUEST_STATUS[e.to_status ?? e.status]?.label ?? String(e.to_status ?? e.status).replace(/_/g, " ")}
            <span className="text-muted-foreground ml-2 text-xs font-normal">
              {fmt(e.created_at ?? e.at)}
              {e.actor_kind === "requester" ? " · you" : e.actor_kind === "staff" ? " · UniSphere privacy team" : ""}
            </span>
          </p>
          {e.note && <p className="text-muted-foreground mt-0.5 text-[13px] whitespace-pre-wrap">{e.note}</p>}
        </li>
      ))}
    </ol>
  );
}
