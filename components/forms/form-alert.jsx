import { AlertCircle, CheckCircle2, Info, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

const STYLES = {
  error: { icon: AlertCircle, cls: "border-destructive/30 bg-destructive/8 text-destructive", role: "alert" },
  success: { icon: CheckCircle2, cls: "border-success/30 bg-success/8 text-success", role: "status" },
  info: { icon: Info, cls: "border-primary/25 bg-accent text-accent-foreground", role: "status" },
  warning: { icon: TriangleAlert, cls: "border-warning/35 bg-warning/10 text-warning-text", role: "status" },
};

export function FormAlert({ variant = "error", title, children, className }) {
  if (!children && !title) return null;
  const { icon: Icon, cls, role } = STYLES[variant];
  return (
    <div role={role} className={cn("flex gap-2.5 rounded-md border px-3 py-2.5 text-sm", cls, className)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && "opacity-90")}>{children}</div>}
      </div>
    </div>
  );
}
