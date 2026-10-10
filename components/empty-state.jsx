import { cn } from "@/lib/utils";

/** Friendly empty / zero-result state with an optional next step. */
export function EmptyState({ icon: Icon, title, children, action, className }) {
  return (
    <div className={cn("border-border-strong flex flex-col items-center rounded-2xl border border-dashed px-6 py-12 text-center", className)}>
      {Icon && (
        <span className="border-foreground bg-sun text-foreground mb-5 flex size-12 -rotate-3 items-center justify-center rounded-xl border shadow-[2px_2px_0_0_var(--hard)]">
          <Icon className="size-5" aria-hidden="true" />
        </span>
      )}
      <h2 className="font-heading text-xl font-extrabold tracking-tight">{title}</h2>
      {children && <div className="text-muted-foreground mt-2 max-w-sm text-sm leading-relaxed">{children}</div>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
