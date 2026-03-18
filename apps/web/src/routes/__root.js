import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { createORPCClient } from "@orpc/client";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { Toaster } from "@myagents/ui/components/sonner";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { HeadContent, Outlet, createRootRouteWithContext } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { useState } from "react";
import BottomNav from "@/components/bottom-nav";
import Header from "@/components/header";
import { ThemeProvider } from "@/components/theme-provider";
import { link, orpc } from "@/utils/orpc";
import "../index.css";
export const Route = createRootRouteWithContext()({
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
    const [client] = useState(() => createORPCClient(link));
    const [orpcUtils] = useState(() => createTanstackQueryUtils(client));
    return (_jsxs(_Fragment, { children: [_jsx(HeadContent, {}), _jsxs(ThemeProvider, { attribute: "class", defaultTheme: "dark", disableTransitionOnChange: true, storageKey: "vite-ui-theme", children: [_jsxs("div", { className: "grid grid-rows-[auto_1fr] h-svh md:pb-0 pb-14", style: {
                            paddingTop: "var(--safe-area-top)",
                            paddingLeft: "var(--safe-area-left)",
                            paddingRight: "var(--safe-area-right)",
                        }, children: [_jsx(Header, {}), _jsx("main", { style: { viewTransitionName: "page" }, className: "min-h-0 overflow-y-auto", children: _jsx(Outlet, {}) }), _jsx(BottomNav, {})] }), _jsx(Toaster, { richColors: true })] }), _jsx(TanStackRouterDevtools, { position: "bottom-left" }), _jsx(ReactQueryDevtools, { position: "bottom", buttonPosition: "bottom-right" })] }));
}
