import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Link } from "@tanstack/react-router";
import { Bot, LayoutDashboard, MessageSquare, Settings } from "lucide-react";
const navItems = [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/agents", label: "Agents", icon: Bot },
    { to: "/conversations", label: "Chats", icon: MessageSquare },
    { to: "/settings", label: "Settings", icon: Settings },
];
export default function BottomNav() {
    return (_jsx("nav", { className: "fixed bottom-0 left-0 right-0 z-50 border-t bg-background/80 backdrop-blur-lg md:hidden", style: { paddingBottom: "var(--safe-area-bottom)" }, children: _jsx("div", { className: "flex items-center justify-around h-14", children: navItems.map((item) => (_jsxs(Link, { to: item.to, className: "flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 text-muted-foreground transition-colors min-w-[64px] min-h-[44px]", activeProps: {
                    className: "flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 text-primary transition-colors min-w-[64px] min-h-[44px]",
                }, children: [_jsx(item.icon, { className: "h-5 w-5" }), _jsx("span", { className: "text-[10px] font-medium leading-tight", children: item.label })] }, item.to))) }) }));
}
