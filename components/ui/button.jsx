import * as React from "react"
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

/**
 * Buttons are tactile: a small, confident press. `hot` is the one loud action on a screen (publish, post, join):
 * a coral face with an ink outline and an offset shadow that the button pushes into when pressed. Everything else
 * is quieter. Motion is transform-only and is switched off for reduced-motion members by the global rule.
 */
const buttonVariants = cva(
  "relative inline-flex shrink-0 select-none items-center justify-center gap-2 rounded-lg text-sm font-semibold whitespace-nowrap outline-none transition-[transform,box-shadow,background-color,border-color,color,opacity] duration-150 ease-out focus-visible:ring-[3px] focus-visible:ring-ring/45 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "border border-primary bg-primary text-primary-foreground hover:-translate-y-px hover:shadow-[0_3px_0_0_color-mix(in_srgb,var(--foreground)_30%,transparent)] active:translate-y-0 active:scale-[0.985] active:shadow-none",
        hot:
          "border border-[var(--hard)] bg-accent-hot text-accent-hot-foreground shadow-[2px_2px_0_0_var(--hard)] hover:-translate-x-px hover:-translate-y-px hover:shadow-[3px_3px_0_0_var(--hard)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none",
        destructive:
          "border border-destructive-text bg-destructive-text text-background hover:brightness-110 active:scale-[0.985]",
        outline:
          "border border-border-strong bg-card text-foreground hover:border-foreground/70 hover:bg-accent active:scale-[0.985]",
        secondary:
          "border border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/70 active:scale-[0.985]",
        ghost:
          "border border-transparent text-foreground hover:bg-accent active:scale-[0.97]",
        link: "text-foreground underline decoration-border-strong decoration-2 underline-offset-4 hover:decoration-coral",
        ink:
          "border border-primary bg-primary text-primary-foreground hover:-translate-y-px hover:shadow-[0_3px_0_0_color-mix(in_srgb,var(--foreground)_30%,transparent)] active:translate-y-0 active:scale-[0.985] active:shadow-none",
        soft:
          "border border-transparent bg-accent text-accent-foreground hover:bg-accent/70 active:scale-[0.985]",
        success:
          "border border-success-text bg-success-text text-background hover:brightness-110 active:scale-[0.985]",
      },
      size: {
        default: "h-10 px-4 has-[>svg]:px-3.5",
        xs: "h-7 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-9 gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-12 px-6 text-base has-[>svg]:px-5 [&_svg:not([class*='size-'])]:size-[18px]",
        icon: "size-10",
        "icon-xs": "size-7 rounded-md [&_svg:not([class*='size-'])]:size-3.5",
        "icon-sm": "size-9",
        "icon-lg": "size-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props} />
  );
}

export { Button, buttonVariants }
