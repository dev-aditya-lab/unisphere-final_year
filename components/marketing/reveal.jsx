/**
 * A gentle fade-up as a section enters the viewport, in CSS only (`animation-timeline: view()`, see `.reveal` in
 * app/globals.css). No JavaScript runs for it, browsers without scroll-driven animations show the content at once,
 * and reduced-motion members get no movement. `delay` is accepted for call-site compatibility and ignored.
 * Use `immediate` for anything above the fold.
 */
export function Reveal({ children, className, as: Tag = "div", immediate = false }) {
  const cls = [immediate ? "" : "reveal", className].filter(Boolean).join(" ");
  return <Tag className={cls || undefined}>{children}</Tag>;
}
