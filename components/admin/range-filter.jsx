import Link from "next/link";
import { Button } from "@/components/ui/button";
import { RANGE_PRESETS } from "@/lib/admin/range";
import { cn } from "@/lib/utils";

/**
 * Date range + college filter. A plain GET form, so it works without JavaScript and the URL is shareable.
 */
export function RangeFilter({ basePath, range, scope }) {
  const preset = (n) => `${basePath}?range=${n}${scope?.college ? `&college=${scope.college}` : ""}`;
  return (
    <form action={basePath} method="get" className="surface mb-5 flex flex-wrap items-end gap-3 p-3">
      <div role="group" aria-label="Quick ranges" className="flex gap-1.5">
        {RANGE_PRESETS.map((n) => (
          <Link
            key={n}
            href={preset(n)}
            aria-current={range.preset === n ? "true" : undefined}
            className={cn("rounded-md border px-3 py-1.5 text-[13px] font-medium", range.preset === n ? "bg-accent text-accent-foreground border-transparent" : "text-muted-foreground hover:bg-muted")}
          >
            Last {n} days
          </Link>
        ))}
      </div>
      <label className="text-[13px]">
        <span className="text-muted-foreground mb-1 block text-xs font-medium">From</span>
        <input type="date" name="from" defaultValue={range.from} max={range.to} className="border-input bg-card h-9 rounded-md border px-2 text-sm" />
      </label>
      <label className="text-[13px]">
        <span className="text-muted-foreground mb-1 block text-xs font-medium">To</span>
        <input type="date" name="to" defaultValue={range.to} className="border-input bg-card h-9 rounded-md border px-2 text-sm" />
      </label>
      {scope && (scope.global || scope.options.length > 1) ? (
        <label className="text-[13px]">
          <span className="text-muted-foreground mb-1 block text-xs font-medium">College</span>
          <select name="college" defaultValue={scope.college ?? ""} className="border-input bg-card h-9 rounded-md border px-2 text-sm">
            {scope.global && <option value="">All colleges</option>}
            {scope.options.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <Button type="submit" size="sm" variant="secondary">
        Apply
      </Button>
    </form>
  );
}
