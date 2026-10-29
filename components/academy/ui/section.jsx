import { cn } from "@/lib/utils";
import { Reveal } from "@/components/academy/ui/reveal";

export function SectionHeading({ kicker, title, children, className, align = "left" }) {
  return (
    <Reveal className={cn("max-w-2xl", align === "center" && "mx-auto text-center", className)}>
      {kicker && <p className="ac-kicker">{kicker}</p>}
      <h2 className="ac-display mt-3 text-[clamp(2rem,4vw,3rem)]">{title}</h2>
      {children && <p className="text-muted-foreground mt-4 text-lg">{children}</p>}
    </Reveal>
  );
}

/** What to show where there is nothing yet, said plainly (never filler content). */
export function EmptyBlock({ title, children, action, className }) {
  return (
    <div className={cn("ac-card border-dashed px-6 py-12 text-center", className)}>
      <p className="ac-display text-2xl">{title}</p>
      {children && <p className="text-muted-foreground mx-auto mt-2 max-w-md text-sm">{children}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
