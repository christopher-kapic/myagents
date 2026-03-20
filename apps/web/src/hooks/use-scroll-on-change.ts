import { useEffect, type RefObject } from "react";

/**
 * Scrolls a container to the bottom whenever the dependency changes
 * and the container has content.
 */
export function useScrollOnChange(
  containerRef: RefObject<HTMLElement | null>,
  dep: unknown,
  behavior: ScrollBehavior = "smooth",
) {
  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      container.scrollTo({ top: container.scrollHeight, behavior });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dep, containerRef]);
}
