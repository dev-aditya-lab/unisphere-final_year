/**
 * A template re-mounts on every navigation (a layout does not), so each new page eases in while the shell around
 * it stays put. It is a plain CSS animation (in the server HTML, no JavaScript) and is disabled by the global
 * prefers-reduced-motion rule. It uses `backwards` fill so no transform lingers: a lingering transform would turn
 * this element into the containing block for `position: fixed` descendants.
 */
export default function Template({ children }) {
  return <div className="page-enter">{children}</div>;
}
