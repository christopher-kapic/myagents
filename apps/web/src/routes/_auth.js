import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Button } from "@myagents/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@myagents/ui/components/card";
import { Input } from "@myagents/ui/components/input";
import { Label } from "@myagents/ui/components/label";
import { Skeleton } from "@myagents/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { orpc } from "@/utils/orpc";
export const Route = createFileRoute("/_auth")({
    beforeLoad: async () => {
        const session = await authClient.getSession();
        if (!session.data) {
            throw redirect({ to: "/login" });
        }
        return { session: session.data };
    },
    component: AuthLayout,
});
function AuthLayout() {
    const { session } = Route.useRouteContext();
    const appSettings = useQuery(orpc.settings.getAll.queryOptions());
    if (appSettings.isLoading) {
        return (_jsxs("div", { className: "container mx-auto max-w-4xl px-4 py-8 space-y-4", children: [_jsx(Skeleton, { className: "h-8 w-48" }), _jsx(Skeleton, { className: "h-5 w-64" }), _jsxs("div", { className: "mt-8 space-y-3", children: [_jsx(Skeleton, { className: "h-32 w-full rounded-lg" }), _jsx(Skeleton, { className: "h-32 w-full rounded-lg" })] })] }));
    }
    const force2FA = appSettings.data?.force2fa === "true";
    const has2FA = session.user.twoFactorEnabled === true;
    if (force2FA && !has2FA) {
        return _jsx(TwoFactorSetupRequired, {});
    }
    return _jsx(Outlet, {});
}
function TwoFactorSetupRequired() {
    const [step, setStep] = useState("intro");
    const [totpURI, setTotpURI] = useState("");
    const [backupCodes, setBackupCodes] = useState([]);
    const [verifyCode, setVerifyCode] = useState("");
    const [password, setPassword] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const handleEnable = async () => {
        setIsLoading(true);
        try {
            const result = await authClient.twoFactor.enable({
                password,
            });
            if (result.error) {
                toast.error(result.error.message || "Failed to enable 2FA");
                return;
            }
            setTotpURI(result.data?.totpURI || "");
            setBackupCodes(result.data?.backupCodes || []);
            setStep("verify");
        }
        finally {
            setIsLoading(false);
        }
    };
    const handleVerify = async () => {
        setIsLoading(true);
        try {
            const result = await authClient.twoFactor.verifyTotp({
                code: verifyCode,
            });
            if (result.error) {
                toast.error(result.error.message || "Invalid code");
                return;
            }
            toast.success("Two-factor authentication enabled");
            window.location.reload();
        }
        finally {
            setIsLoading(false);
        }
    };
    const secretFromURI = totpURI ? new URL(totpURI).searchParams.get("secret") || "" : "";
    return (_jsx("div", { className: "flex min-h-[80vh] items-center justify-center px-4", children: _jsxs(Card, { className: "w-full max-w-md", children: [_jsxs(CardHeader, { className: "text-center", children: [_jsx(CardTitle, { className: "text-2xl", children: "Two-Factor Authentication Required" }), _jsx(CardDescription, { children: "Your organization requires two-factor authentication. Please set it up to continue." })] }), _jsxs(CardContent, { className: "space-y-4", children: [step === "intro" && (_jsxs(_Fragment, { children: [_jsx("p", { className: "text-sm text-muted-foreground", children: "You'll need an authenticator app like Authy, Google Authenticator, or 1Password to generate verification codes." }), _jsx(Button, { className: "w-full", onClick: () => setStep("setup"), children: "Set Up 2FA" })] })), step === "setup" && (_jsxs(_Fragment, { children: [_jsx("p", { className: "text-sm text-muted-foreground", children: "Enter your password to begin setup." }), _jsxs("div", { className: "space-y-2", children: [_jsx(Label, { htmlFor: "2fa-password", children: "Password" }), _jsx(Input, { id: "2fa-password", type: "password", value: password, onChange: (e) => setPassword(e.target.value), onKeyDown: (e) => {
                                                if (e.key === "Enter")
                                                    handleEnable();
                                            } })] }), _jsx(Button, { className: "w-full", onClick: handleEnable, disabled: !password || isLoading, children: isLoading ? "Setting up..." : "Continue" })] })), step === "verify" && (_jsxs(_Fragment, { children: [_jsxs("div", { className: "space-y-3", children: [_jsx("p", { className: "text-sm text-muted-foreground", children: "Add this key to your authenticator app:" }), _jsx("code", { className: "block break-all rounded bg-muted p-3 text-center text-sm font-mono", children: secretFromURI })] }), backupCodes.length > 0 && (_jsxs("div", { className: "space-y-2", children: [_jsx("p", { className: "text-sm font-medium", children: "Backup codes (save these):" }), _jsx("div", { className: "grid grid-cols-2 gap-1 rounded bg-muted p-3", children: backupCodes.map((code) => (_jsx("code", { className: "text-xs font-mono", children: code }, code))) })] })), _jsxs("div", { className: "space-y-2", children: [_jsx(Label, { htmlFor: "verify-code", children: "Verification Code" }), _jsx(Input, { id: "verify-code", placeholder: "000000", value: verifyCode, onChange: (e) => setVerifyCode(e.target.value), maxLength: 6, className: "text-center text-lg tracking-widest", onKeyDown: (e) => {
                                                if (e.key === "Enter" && verifyCode.length === 6)
                                                    handleVerify();
                                            } })] }), _jsx(Button, { className: "w-full", onClick: handleVerify, disabled: verifyCode.length !== 6 || isLoading, children: isLoading ? "Verifying..." : "Verify & Enable" })] }))] })] }) }));
}
