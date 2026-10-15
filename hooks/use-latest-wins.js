"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createLatestWins } from "@/lib/client/latest-wins";

/**
 * `const [value, setValue] = useLatestWins(initial, { save, equals, onError })`
 * `value` is what to render (optimistic); `setValue(next)` shows it immediately and saves it. See lib/client/latest-wins.js.
 * The callbacks may close over fresh props and state: the newest ones are used when a request is made.
 */
export function useLatestWins(initial, options) {
  const [value, setValue] = useState(initial);
  const optionsRef = useRef(options);
  const controllerRef = useRef(null);

  useEffect(() => {
    optionsRef.current = options;
  });

  useEffect(() => {
    controllerRef.current = createLatestWins({
      initial,
      equals: (a, b) => (optionsRef.current.equals ?? Object.is)(a, b),
      save: (v) => optionsRef.current.save(v),
      onChange: setValue,
      onError: (message, attempted) => optionsRef.current.onError?.(message, attempted),
    });
    return () => {
      controllerRef.current = null;
    };
    // The controller is created once per mounted component: `initial` is the server's value at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = useCallback((next) => controllerRef.current?.set(next), []);
  return [value, set];
}
