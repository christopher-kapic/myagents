import { createORPCClient } from "@orpc/client";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import type { AppRouterClient } from "@myagents/api/routers/index";
import { Toaster } from "@myagents/ui/components/sonner";
import type { QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { HeadContent, Outlet, createRootRouteWithContext } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { useState } from "react";

import BottomNav from "@/components/bottom-nav";
import Header from "@/components/header";
import { ThemeProvider } from "@/components/theme-provider";
import { useAppUpdate } from "@/hooks/use-app-update";
import { useMobileKeyboard } from "@/hooks/use-mobile-keyboard";
import { useNavDirection } from "@/hooks/use-nav-direction";
import { link, orpc } from "@/utils/orpc";

import "../index.css";

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
          className={`grid h-svh ${mobileKeyboardOpen ? "grid-rows-[1fr]" : "grid-rows-[auto_1fr_auto] md:grid-rows-[auto_1fr]"}`}
          style={{
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
        <Toaster richColors />
      </ThemeProvider>
      <TanStackRouterDevtools position="bottom-left" />
      <ReactQueryDevtools position="bottom" buttonPosition="bottom-right" />
    </>
  );
}
