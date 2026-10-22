export default function Loading() {
  return (
    <div role="status" aria-label="Loading Refer & Earn" className="space-y-4">
      <div aria-hidden="true" className="space-y-2 pb-2">
        <div className="skeleton h-3 w-20" />
        <div className="skeleton h-9 w-48" />
      </div>
      <div aria-hidden="true" className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          <div className="surface skeleton h-96" />
          <div className="grid grid-cols-3 gap-3">
            {[0, 1, 2].map((i) => <div key={i} className="surface skeleton h-24" />)}
          </div>
          <div className="surface skeleton h-56" />
        </div>
        <div className="space-y-4">
          <div className="surface skeleton h-80" />
          <div className="surface skeleton h-48" />
        </div>
      </div>
      <span className="sr-only">Loading</span>
    </div>
  );
}
