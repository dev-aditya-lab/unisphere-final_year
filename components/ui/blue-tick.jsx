import { cn } from "@/lib/utils";

// A scalloped seal with a check mark, drawn as one path so it stays sharp at any size and needs no image request.
// The colour passes 3:1 against both the light and dark page backgrounds (WCAG 1.4.11, graphical objects).
const SEAL = "M12.00 0.18L12.76 0.37L13.46 0.88L14.08 1.52L14.66 2.06L15.27 2.36L15.99 2.38L16.82 2.23L17.71 2.12L18.53 2.22L19.18 2.64L19.58 3.35L19.78 4.22L19.89 5.08L20.09 5.79L20.51 6.31L21.17 6.71L21.96 7.09L22.70 7.57L23.19 8.20L23.32 8.97L23.10 9.79L22.69 10.59L22.32 11.32L22.18 12.00L22.32 12.68L22.69 13.41L23.10 14.21L23.32 15.03L23.19 15.80L22.70 16.43L21.96 16.91L21.17 17.29L20.51 17.69L20.09 18.21L19.89 18.92L19.78 19.78L19.58 20.65L19.18 21.36L18.53 21.78L17.71 21.88L16.82 21.77L15.99 21.62L15.27 21.64L14.66 21.94L14.08 22.48L13.46 23.12L12.76 23.63L12.00 23.82L11.24 23.63L10.54 23.12L9.92 22.48L9.34 21.94L8.73 21.64L8.01 21.62L7.18 21.77L6.29 21.88L5.47 21.78L4.82 21.36L4.42 20.65L4.22 19.78L4.11 18.92L3.91 18.21L3.49 17.69L2.83 17.29L2.04 16.91L1.30 16.43L0.81 15.80L0.68 15.03L0.90 14.21L1.31 13.41L1.68 12.68L1.82 12.00L1.68 11.32L1.31 10.59L0.90 9.79L0.68 8.97L0.81 8.20L1.30 7.57L2.04 7.09L2.83 6.71L3.49 6.31L3.91 5.79L4.11 5.08L4.22 4.22L4.42 3.35L4.82 2.64L5.47 2.22L6.29 2.12L7.18 2.23L8.01 2.38L8.73 2.36L9.34 2.06L9.92 1.52L10.54 0.88L11.24 0.37L12.00 0.18Z";

/** The blue tick. Decorative next to a name (the name is the label), or an image with its own label on its own. */
export function BlueTick({ className, title = "Blue tick: identity confirmed by an administrator", decorative = false }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("inline-block size-4 shrink-0 align-[-0.2em]", className)}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : title}
      aria-hidden={decorative ? "true" : undefined}
      focusable="false"
    >
      {!decorative && <title>{title}</title>}
      <path d={SEAL} fill="#1a8cd8" />
      <path d="M7.4 12.4l3.1 3.1 6.1-6.7" fill="none" stroke="#fff" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
