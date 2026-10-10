import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

/**
 * Label + control + hint + error, wired for screen readers.
 * Pass the same `id` to the control and set aria-describedby={`${id}-desc`} when relevant.
 */
export function Field({ id, label, hint, error, required, optional, className, children, labelAction }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-baseline justify-between gap-2">
        {label && (
          <Label htmlFor={id} className="text-[13px] font-semibold">
            {label}
            {required && <span aria-hidden="true" className="text-destructive-text"> *</span>}
            {optional && <span className="text-muted-foreground ml-1 text-xs font-normal">(optional)</span>}
          </Label>
        )}
        {labelAction}
      </div>
      {children}
      {hint && !error && (
        <p id={`${id}-desc`} className="text-muted-foreground text-xs">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-desc`} role="alert" className="text-destructive-text text-xs font-medium">
          {error}
        </p>
      )}
    </div>
  );
}
