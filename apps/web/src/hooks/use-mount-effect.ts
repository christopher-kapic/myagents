import { useEffect } from "react";

/**
 * Runs a callback once on mount. This is the only approved way to do
 * `useEffect(fn, [])` — it names the intent and satisfies the useEffect ban
 * in component files.
 */
export function useMountEffect(fn: () => void | (() => void)) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(fn, []);
}
