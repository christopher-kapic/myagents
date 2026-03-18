import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Link, Outlet, createFileRoute } from "@tanstack/react-router";
import { KeyRound, Settings, Shield, UserCog } from "lucide-react";
export const Route = createFileRoute("/_auth/settings")({
    component: SettingsLayout,
});
function SettingsLayout() {
    const { session } = Route.useRouteContext();
    const isAdmin = session.user.role === "admin";
    const navItems = [
        { to: "/settings", label: "Profile", icon: Settings, exact: true },
        { to: "/settings/security", label: "Security", icon: Shield, exact: false },
        { to: "/settings/api-keys", label: "API Keys", icon: KeyRound, exact: false },
        ...(isAdmin
            ? [{ to: "/settings/admin", label: "Admin", icon: UserCog, exact: false }]
            : []),
    ];
    return (_jsxs("div", { className: "container mx-auto max-w-4xl px-4 py-8", children: [_jsx("h1", { className: "text-2xl font-bold mb-6", children: "Settings" }), _jsxs("div", { className: "flex flex-col gap-6 md:flex-row md:gap-8", children: [_jsx("nav", { className: "w-full md:w-48 flex-shrink-0", children: _jsx("div", { className: "flex flex-row gap-1 md:flex-col", children: navItems.map((item) => (_jsxs(Link, { to: item.to, activeOptions: { exact: item.exact }, className: "flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors", activeProps: {
                                    className: "flex items-center gap-2 rounded-md px-3 py-2 text-sm bg-accent text-accent-foreground transition-colors",
                                }, children: [_jsx(item.icon, { className: "h-4 w-4" }), item.label] }, item.to))) }) }), _jsx("div", { className: "flex-1 min-w-0", children: _jsx(Outlet, {}) })] })] }));
}
