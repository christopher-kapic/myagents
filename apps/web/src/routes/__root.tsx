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
  const [client] = useState<AppRouterClient>(() => createORPCClient(link));
  const [orpcUtils] = useState(() => createTanstackQueryUtils(client));

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
          className="grid grid-rows-[auto_1fr] h-svh pb-[calc(3.5rem+var(--safe-area-bottom))] md:pb-0"
          style={{
            paddingTop: "var(--safe-area-top)",
            paddingLeft: "var(--safe-area-left)",
            paddingRight: "var(--safe-area-right)",
          }}
        >
          <Header />
          <main style={{ viewTransitionName: "page" }} className="min-h-0 overflow-y-auto">
            <Outlet />
          </main>
          <BottomNav />
        </div>
        <Toaster richColors />
      </ThemeProvider>
      <TanStackRouterDevtools position="bottom-left" />
      <ReactQueryDevtools position="bottom" buttonPosition="bottom-right" />
    </>
  );
}
