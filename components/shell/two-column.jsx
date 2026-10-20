/**
 * A readable main column (at most 40rem) plus an optional contextual sidebar. The sidebar needs the room only wide
 * screens have, so it appears from xl; below that the column stays centred at a comfortable measure instead of
 * stretching or sharing space with a cramped panel.
 */
export function TwoColumn({ children, aside }) {
  return (
    <div className={aside ? "mx-auto w-full max-w-[40rem] xl:grid xl:max-w-[63rem] xl:grid-cols-[minmax(0,40rem)_20rem] xl:gap-8" : "mx-auto w-full max-w-[40rem]"}>
      <div className="min-w-0">{children}</div>
      {aside && (
        <aside aria-label="Related" className="hidden xl:block">
          <div className="sticky top-20 max-h-[calc(100dvh-6rem)] overflow-y-auto overscroll-contain">{aside}</div>
        </aside>
      )}
    </div>
  );
}
