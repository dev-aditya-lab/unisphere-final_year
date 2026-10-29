import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { priceSummary } from "@/lib/academy/money";

/** A price as the pricing engine worked it out (academy_catalog_prices): the amount, the list price struck through, the sale and its end. */
export function PriceTag({ price, size = "md", className }) {
  const p = priceSummary(price);
  const big = size === "lg";
  return (
    <div className={cn("flex flex-wrap items-baseline gap-x-2 gap-y-1", className)}>
      <span className={cn("font-bold tabular-nums", big ? "ac-display text-4xl" : "text-lg", p.free && "text-[var(--success-text)]")}>{p.label}</span>
      {p.was && <span className={cn("ac-price-was tabular-nums", big ? "text-lg" : "text-sm")}>{p.was}</span>}
      {p.taxNote && <span className="text-muted-foreground text-xs">{p.taxNote}</span>}
      {p.saleLabel && (
        <span className="ac-sale inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold">
          {p.saleLabel}{p.percentOff ? ` · ${p.percentOff}% off` : ""}
          {p.saleEnds && <><Clock className="size-3" aria-hidden /><span>ends {new Date(p.saleEnds).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })}</span></>}
        </span>
      )}
      {p.seatsLeft !== null && p.seatsLeft !== undefined && p.seatsLeft <= 10 && <span className="text-xs font-semibold">{p.seatsLeft} {p.seatsLeft === 1 ? "seat" : "seats"} left</span>}
    </div>
  );
}
