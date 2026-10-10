import { cn } from "@/lib/utils"

function Skeleton({
  className,
  ...props
}) {
  return (
    <div
      data-slot="skeleton"
      className={cn("skeleton", className)}
      {...props} />
  );
}

export { Skeleton }
