import { cn } from "@/lib/utils";

/** Friendly empty / zero-result state with an optional next step. */
export function EmptyState({ icon: Icon, title, children, action, className }) {
  return (
    <div className={cn("surface flex flex-col items-center px-6 py-12 text-center", className)}>
      {Icon && (
        <span className="bg-muted text-muted-foreground mb-4 flex size-11 items-center justify-center rounded-full">
          <Icon className="size-5" aria-hidden="true" />
        </span>
      )}
      <h2 className="font-heading text-lg font-bold">{title}</h2>
      {children && <div className="text-muted-foreground mt-1.5 max-w-sm text-sm">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
