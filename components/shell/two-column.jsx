/** Main column + optional contextual right sidebar (visible from lg). */
export function TwoColumn({ children, aside }) {
  return (
    <div className={aside ? "grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]" : ""}>
      <div className="min-w-0">{children}</div>
      {aside && <aside aria-label="Related" className="hidden lg:block"><div className="sticky top-20">{aside}</div></aside>}
    </div>
  );
}
