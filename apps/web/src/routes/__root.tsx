import { createORPCClient } from "@orpc/client";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import type { AppRouterClient } from "@myagents/api/routers/index";
import { Toaster } from "@myagents/ui/components/sonner";
import type { QueryClient } from "@tanstack/react-query";
import { HeadContent, Outlet, createRootRouteWithContext } from "@tanstack/react-router";
import { Suspense, lazy, useState } from "react";

import BottomNav from "@/components/bottom-nav";
import Header from "@/components/header";
import { ThemeProvider } from "@/components/theme-provider";
import { useAppUpdate } from "@/hooks/use-app-update";
import { useMobileKeyboard } from "@/hooks/use-mobile-keyboard";
import { useNavDirection } from "@/hooks/use-nav-direction";
import { link, orpc } from "@/utils/orpc";

import "../index.css";

const TanStackRouterDevtools = import.meta.env.DEV
  ? lazy(() => import("@tanstack/react-router-devtools").then(m => ({ default: m.TanStackRouterDevtools })))
  : () => null;

const ReactQueryDevtools = import.meta.env.DEV
  ? lazy(() => import("@tanstack/react-query-devtools").then(m => ({ default: m.ReactQueryDevtools })))
  : () => null;

interface RouterAppContext {
  orpc: typeof orpc;
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
  component: RootComponent,
  head: () => ({
    meta: [
      {
        title: "MyAgents",
      },
      {
        name: "description",
        content: "MyAgents - AI Agent Fleet Management",
      },
    ],
    links: [
      {
        rel: "icon",
        href: "/favicon.ico",
      },
    ],
  }),
});

function RootComponent() {
  useAppUpdate();
  useNavDirection();
  const [client] = useState<AppRouterClient>(() => createORPCClient(link));
  const [orpcUtils] = useState(() => createTanstackQueryUtils(client));
  const mobileKeyboardOpen = useMobileKeyboard();

  return (
    <>
      <HeadContent />
      <ThemeProvider
        attribute="class"
        defaultTheme="dark"
        disableTransitionOnChange
        storageKey="vite-ui-theme"
      >
        <div
          className="grid h-svh grid-rows-[auto_1fr_auto] md:grid-rows-[auto_1fr]"
          style={{
            gridTemplateRows: mobileKeyboardOpen ? "0fr 1fr 0fr" : undefined,
            paddingTop: mobileKeyboardOpen ? undefined : "var(--safe-area-top)",
            paddingLeft: "var(--safe-area-left)",
            paddingRight: "var(--safe-area-right)",
          }}
        >
          {!mobileKeyboardOpen && <Header />}
          <main style={{ viewTransitionName: "page", scrollbarGutter: "stable" }} className="min-h-0 overflow-y-auto">
            <Outlet />
          </main>
          <BottomNav hidden={mobileKeyboardOpen} />
        </div>
        <Toaster richColors position="top-right" />
      </ThemeProvider>
      <Suspense>
        <TanStackRouterDevtools position="bottom-left" />
        <ReactQueryDevtools position="bottom" buttonPosition="bottom-right" />
      </Suspense>
    </>
  );
}
