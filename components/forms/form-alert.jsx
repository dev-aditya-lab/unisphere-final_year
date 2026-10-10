import { AlertCircle, CheckCircle2, Info, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

const STYLES = {
  error: { icon: AlertCircle, cls: "border-destructive/40 bg-destructive-soft text-destructive-text", role: "alert" },
  success: { icon: CheckCircle2, cls: "border-success/40 bg-success-soft text-success-text", role: "status" },
  info: { icon: Info, cls: "border-info/40 bg-info-soft text-info-text", role: "status" },
  warning: { icon: TriangleAlert, cls: "border-warning/50 bg-warning-soft text-warning-text", role: "status" },
};

export function FormAlert({ variant = "error", title, children, className }) {
  if (!children && !title) return null;
  const { icon: Icon, cls, role } = STYLES[variant];
  return (
    <div role={role} className={cn("flex gap-2.5 rounded-xl border px-3.5 py-3 text-sm font-medium", cls, className)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && "opacity-90")}>{children}</div>}
      </div>
    </div>
  );
}
