import * as React from "react"
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-md border border-transparent px-2 py-0.5 text-xs font-semibold whitespace-nowrap transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/45 aria-invalid:border-destructive [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a&]:hover:opacity-90",
        secondary: "bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/80",
        destructive: "bg-destructive-text text-background [a&]:hover:opacity-90",
        outline: "border-border-strong text-foreground [a&]:hover:bg-accent",
        ghost: "[a&]:hover:bg-accent",
        link: "text-foreground underline underline-offset-4 [a&]:hover:decoration-coral",
        soft: "bg-accent text-accent-foreground",
        hot: "bg-accent-hot text-accent-hot-foreground",
        success: "bg-success-soft text-success-text",
        warning: "bg-warning-soft text-warning-text",
        danger: "bg-destructive-soft text-destructive-text",
        info: "bg-info-soft text-info-text",
        // Small uppercase label for metadata ("Draft", "Pinned", a role): no monospace.
        mono: "border-border bg-muted text-[11px] font-bold tracking-[0.08em] text-muted-foreground uppercase",
        // Coloured by the nearest `tone-*` class: used for content types and categories.
        tone: "tone-chip",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props} />
  );
}

export { Badge, badgeVariants }
