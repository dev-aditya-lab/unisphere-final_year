import { cn } from "@/lib/utils";

/** Consistent page title block: kicker, display heading, optional description and actions. */
export function PageHeader({ eyebrow, title, description, actions, className }) {
  return (
    <div className={cn("mb-6 flex flex-wrap items-end justify-between gap-x-4 gap-y-3", className)}>
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h1 className="text-[1.75rem] leading-[1.05] font-extrabold tracking-tight sm:text-[2.125rem]">{title}</h1>
        {description && <p className="text-muted-foreground mt-2 max-w-2xl text-[0.9375rem] leading-relaxed">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
