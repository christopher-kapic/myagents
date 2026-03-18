import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Button } from "@myagents/ui/components/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, } from "@myagents/ui/components/dropdown-menu";
import { Skeleton } from "@myagents/ui/components/skeleton";
import { Link, useNavigate } from "@tanstack/react-router";
import { Settings } from "lucide-react";
import { authClient } from "@/lib/auth-client";
export default function UserMenu() {
    const navigate = useNavigate();
    const { data: session, isPending } = authClient.useSession();
    if (isPending) {
        return _jsx(Skeleton, { className: "h-9 w-24" });
    }
    if (!session) {
        return (_jsx(Link, { to: "/login", children: _jsx(Button, { variant: "outline", children: "Sign In" }) }));
    }
    return (_jsxs(DropdownMenu, { children: [_jsx(DropdownMenuTrigger, { render: _jsx(Button, { variant: "outline" }), children: session.user.name }), _jsx(DropdownMenuContent, { className: "bg-card", children: _jsxs(DropdownMenuGroup, { children: [_jsx(DropdownMenuLabel, { children: "My Account" }), _jsx(DropdownMenuSeparator, {}), _jsx(DropdownMenuItem, { children: session.user.email }), _jsxs(DropdownMenuItem, { onClick: () => navigate({ to: "/settings" }), children: [_jsx(Settings, { className: "mr-2 h-4 w-4" }), "Settings"] }), _jsx(DropdownMenuSeparator, {}), _jsx(DropdownMenuItem, { variant: "destructive", onClick: () => {
                                authClient.signOut({
                                    fetchOptions: {
                                        onSuccess: () => {
                                            navigate({ to: "/login" });
                                        },
                                    },
                                });
                            }, children: "Sign Out" })] }) })] }));
}
