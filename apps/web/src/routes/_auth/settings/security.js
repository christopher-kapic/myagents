import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Button } from "@myagents/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, } from "@myagents/ui/components/card";
import { Input } from "@myagents/ui/components/input";
import { Label } from "@myagents/ui/components/label";
import { createFileRoute } from "@tanstack/react-router";
import { ShieldCheck, ShieldOff } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
export const Route = createFileRoute("/_auth/settings/security")({
    component: SecuritySettings,
});
function SecuritySettings() {
    const { session } = Route.useRouteContext();
    const has2FA = session.user.twoFactorEnabled === true;
    return (_jsx("div", { className: "space-y-6", children: _jsxs(Card, { children: [_jsxs(CardHeader, { children: [_jsxs(CardTitle, { className: "flex items-center gap-2", children: [has2FA ? (_jsx(ShieldCheck, { className: "h-5 w-5 text-green-500" })) : (_jsx(ShieldOff, { className: "h-5 w-5 text-muted-foreground" })), "Two-Factor Authentication"] }), _jsx(CardDescription, { children: has2FA
                                ? "Two-factor authentication is enabled for your account"
                                : "Add an extra layer of security to your account" })] }), _jsx(CardContent, { children: has2FA ? _jsx(Disable2FASection, {}) : _jsx(Enable2FASection, {}) })] }) }));
}
function Enable2FASection() {
    const [step, setStep] = useState("idle");
    const [password, setPassword] = useState("");
    const [totpURI, setTotpURI] = useState("");
    const [backupCodes, setBackupCodes] = useState([]);
    const [verifyCode, setVerifyCode] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const handleEnable = async () => {
        setIsLoading(true);
        try {
            const result = await authClient.twoFactor.enable({
                password,
            });
            if (result.error) {
                toast.error(result.error.message || "Failed to start 2FA setup");
                return;
            }
            setTotpURI(result.data?.totpURI || "");
            setBackupCodes(result.data?.backupCodes || []);
            setStep("setup");
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
                toast.error(result.error.message || "Invalid verification code");
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
    if (step === "idle") {
        return (_jsx(Button, { onClick: () => setStep("password"), children: "Enable Two-Factor Authentication" }));
    }
    if (step === "password") {
        return (_jsxs("div", { className: "space-y-4 max-w-sm", children: [_jsx("p", { className: "text-sm text-muted-foreground", children: "Confirm your password to set up two-factor authentication." }), _jsxs("div", { className: "space-y-2", children: [_jsx(Label, { htmlFor: "confirm-password", children: "Password" }), _jsx(Input, { id: "confirm-password", type: "password", value: password, onChange: (e) => setPassword(e.target.value), onKeyDown: (e) => {
                                if (e.key === "Enter")
                                    handleEnable();
                            } })] }), _jsxs("div", { className: "flex gap-2", children: [_jsx(Button, { onClick: handleEnable, disabled: !password || isLoading, children: isLoading ? "Setting up..." : "Continue" }), _jsx(Button, { variant: "ghost", onClick: () => setStep("idle"), children: "Cancel" })] })] }));
    }
    if (step === "setup") {
        return (_jsxs("div", { className: "space-y-4 max-w-sm", children: [_jsxs("div", { className: "space-y-2", children: [_jsx("p", { className: "text-sm text-muted-foreground", children: "Add this key to your authenticator app (Authy, Google Authenticator, etc.):" }), _jsx("code", { className: "block break-all rounded bg-muted p-3 text-center text-sm font-mono", children: secretFromURI })] }), backupCodes.length > 0 && (_jsxs("div", { className: "space-y-2", children: [_jsx("p", { className: "text-sm font-medium", children: "Save these backup codes in a safe place:" }), _jsx("div", { className: "grid grid-cols-2 gap-1 rounded bg-muted p-3", children: backupCodes.map((code) => (_jsx("code", { className: "text-xs font-mono", children: code }, code))) })] })), _jsx(Button, { onClick: () => setStep("verify"), children: "I've saved my backup codes" })] }));
    }
    return (_jsxs("div", { className: "space-y-4 max-w-sm", children: [_jsx("p", { className: "text-sm text-muted-foreground", children: "Enter the 6-digit code from your authenticator app to verify setup." }), _jsxs("div", { className: "space-y-2", children: [_jsx(Label, { htmlFor: "setup-verify-code", children: "Verification Code" }), _jsx(Input, { id: "setup-verify-code", placeholder: "000000", value: verifyCode, onChange: (e) => setVerifyCode(e.target.value), maxLength: 6, className: "text-center text-lg tracking-widest", onKeyDown: (e) => {
                            if (e.key === "Enter" && verifyCode.length === 6)
                                handleVerify();
                        } })] }), _jsx(Button, { onClick: handleVerify, disabled: verifyCode.length !== 6 || isLoading, children: isLoading ? "Verifying..." : "Verify & Enable" })] }));
}
function Disable2FASection() {
    const [showConfirm, setShowConfirm] = useState(false);
    const [password, setPassword] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const handleDisable = async () => {
        setIsLoading(true);
        try {
            const result = await authClient.twoFactor.disable({
                password,
            });
            if (result.error) {
                toast.error(result.error.message || "Failed to disable 2FA");
                return;
            }
            toast.success("Two-factor authentication disabled");
            window.location.reload();
        }
        finally {
            setIsLoading(false);
        }
    };
    if (!showConfirm) {
        return (_jsx(Button, { variant: "outline", onClick: () => setShowConfirm(true), children: "Disable Two-Factor Authentication" }));
    }
    return (_jsxs("div", { className: "space-y-4 max-w-sm", children: [_jsx("p", { className: "text-sm text-muted-foreground", children: "Enter your password to disable two-factor authentication." }), _jsxs("div", { className: "space-y-2", children: [_jsx(Label, { htmlFor: "disable-password", children: "Password" }), _jsx(Input, { id: "disable-password", type: "password", value: password, onChange: (e) => setPassword(e.target.value), onKeyDown: (e) => {
                            if (e.key === "Enter")
                                handleDisable();
                        } })] }), _jsxs("div", { className: "flex gap-2", children: [_jsx(Button, { variant: "destructive", onClick: handleDisable, disabled: !password || isLoading, children: isLoading ? "Disabling..." : "Disable 2FA" }), _jsx(Button, { variant: "ghost", onClick: () => setShowConfirm(false), children: "Cancel" })] })] }));
}
