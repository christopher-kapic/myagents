import { useRouter } from "@tanstack/react-router";
import { useMountEffect } from "./use-mount-effect";

/**
 * Ordered top-level routes matching BottomNav.
 * Index determines "position" — lower index = further left.
 */
const NAV_ORDER = ["/dashboard", "/agents", "/conversations", "/settings"];

function getNavIndex(pathname: string): number {
  return NAV_ORDER.findIndex((prefix) => pathname.startsWith(prefix));
}

/**
 * Sets a `data-nav-direction` attribute on `<html>` ("forward" | "back")
 * before each navigation, based on the BottomNav tab order.
 * Falls back to "forward" for non-tab navigations.
 */
export function useNavDirection() {
  const router = useRouter();

  useMountEffect(() => {
    return router.subscribe("onBeforeNavigate", ({ fromLocation, toLocation }) => {
      const fromIndex = fromLocation ? getNavIndex(fromLocation.pathname) : -1;
      const toIndex = getNavIndex(toLocation.pathname);

      const direction =
        fromIndex !== -1 && toIndex !== -1 && toIndex < fromIndex
          ? "back"
          : "forward";

      document.documentElement.setAttribute("data-nav-direction", direction);
    });
  });
}
