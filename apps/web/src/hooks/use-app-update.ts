import { useEffect, useRef } from "react";
import { toast } from "sonner";

const POLL_INTERVAL = 2 * 60 * 1000; // 2 minutes
const INITIAL_CHECK_DELAY = 10 * 1000; // 10 seconds after mount

async function fetchRemoteVersion(): Promise<string | null> {
  try {
    const res = await fetch(`/version.json?_=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    return data.version ?? null;
  } catch {
    return null;
  }
}

export function useAppUpdate() {
  const toastShown = useRef(false);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;

    async function check() {
      const remote = await fetchRemoteVersion();
      if (!remote || remote === __APP_VERSION__) return;
      if (toastShown.current) return;
      toastShown.current = true;

      // Ask the SW to check for an update
      const reg = await navigator.serviceWorker?.getRegistration();
      reg?.update();

      toast.info("A new version is available. Reloading…", { duration: 5000 });
    }

    // Check shortly after mount (catches updates during idle sessions)
    const initialTimer = setTimeout(check, INITIAL_CHECK_DELAY);

    // Then poll every 2 minutes
    timer = setInterval(check, POLL_INTERVAL);

    // Reload when a new SW takes control
    function onControllerChange() {
      window.location.reload();
    }
    navigator.serviceWorker?.addEventListener("controllerchange", onControllerChange);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(timer);
      navigator.serviceWorker?.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);
}
