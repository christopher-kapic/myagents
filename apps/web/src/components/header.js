import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Link } from "@tanstack/react-router";
import { ModeToggle } from "./mode-toggle";
import UserMenu from "./user-menu";
export default function Header() {
    return (_jsxs("div", { children: [_jsxs("div", { className: "flex flex-row items-center justify-between px-4 py-2", children: [_jsx(Link, { to: "/", className: "font-semibold text-lg", children: "MyAgents" }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx(ModeToggle, {}), _jsx(UserMenu, {})] })] }), _jsx("hr", {})] }));
}
