import { useEffect, type RefObject } from "react";

/**
 * Focuses and selects an input element when the given condition becomes true.
 */
export function useFocusOnChange(
  ref: RefObject<HTMLInputElement | null>,
  condition: boolean,
) {
  useEffect(() => {
    if (condition) {
      ref.current?.focus();
      ref.current?.select();
    }
  }, [condition, ref]);
}
