export default function Loading() {
  return (
    <div role="status" aria-label="Loading Orbits" className="space-y-4">
      <div aria-hidden="true" className="space-y-2 pb-2">
        <div className="skeleton h-3 w-20" />
        <div className="skeleton h-9 w-40" />
      </div>
      <div aria-hidden="true" className="grid gap-4 lg:grid-cols-2">
        {[28, 64, 44, 52, 56].map((h, i) => (
          <div key={i} className="surface space-y-3 p-5" style={{ minHeight: `${h * 4}px` }}>
            <div className="flex items-center gap-4">
              <div className="skeleton size-16 rounded-full" />
              <div className="flex-1 space-y-2">
                <div className="skeleton h-3 w-24" />
                <div className="skeleton h-7 w-32" />
              </div>
            </div>
            <div className="skeleton h-20 w-full" />
          </div>
        ))}
      </div>
      <span className="sr-only">Loading</span>
    </div>
  );
}
