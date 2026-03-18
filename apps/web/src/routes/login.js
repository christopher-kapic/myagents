import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Button } from "@myagents/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@myagents/ui/components/card";
import { Input } from "@myagents/ui/components/input";
import { Label } from "@myagents/ui/components/label";
import { Skeleton } from "@myagents/ui/components/skeleton";
import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import z from "zod";
import { authClient } from "@/lib/auth-client";
import { orpc } from "@/utils/orpc";
export const Route = createFileRoute("/login")({
    beforeLoad: async () => {
        const session = await authClient.getSession();
        if (session.data) {
            throw redirect({ to: "/dashboard" });
        }
    },
    component: LoginPage,
});
function LoginPage() {
    const [mode, setMode] = useState("signin");
    const [needs2FA, setNeeds2FA] = useState(false);
    const [totpCode, setTotpCode] = useState("");
    const [isVerifying2FA, setIsVerifying2FA] = useState(false);
    const navigate = useNavigate();
    const { isPending } = authClient.useSession();
    const config = useQuery(orpc.appConfig.queryOptions());
    const ssoEnabled = config.data?.ssoEnabled ?? false;
    const forceSso = config.data?.forceSso ?? false;
    const ssoProviderName = config.data?.ssoProviderName ?? "SSO";
    if (isPending || config.isLoading) {
        return (_jsx("div", { className: "flex min-h-[80vh] items-center justify-center px-4", children: _jsxs("div", { className: "w-full max-w-md space-y-6", children: [_jsxs("div", { className: "space-y-2 text-center", children: [_jsx(Skeleton, { className: "mx-auto h-8 w-40" }), _jsx(Skeleton, { className: "mx-auto h-4 w-56" })] }), _jsxs("div", { className: "space-y-4", children: [_jsx(Skeleton, { className: "h-10 w-full" }), _jsx(Skeleton, { className: "h-10 w-full" }), _jsx(Skeleton, { className: "h-10 w-full" })] })] }) }));
    }
    const handleSsoLogin = async () => {
        await authClient.signIn.social({
            provider: "sso",
            callbackURL: "/dashboard",
        });
    };
    const handle2FAVerify = async () => {
        setIsVerifying2FA(true);
        try {
            const result = await authClient.twoFactor.verifyTotp({
                code: totpCode,
            });
            if (result.error) {
                toast.error(result.error.message || "Invalid code");
            }
            else {
                navigate({ to: "/dashboard" });
                toast.success("Signed in successfully");
            }
        }
        finally {
            setIsVerifying2FA(false);
        }
    };
    if (needs2FA) {
        return (_jsx("div", { className: "flex min-h-[80vh] items-center justify-center px-4", children: _jsxs(Card, { className: "w-full max-w-md", children: [_jsxs(CardHeader, { className: "text-center", children: [_jsx(CardTitle, { className: "text-2xl", children: "Two-Factor Authentication" }), _jsx(CardDescription, { children: "Enter the code from your authenticator app" })] }), _jsxs(CardContent, { className: "space-y-4", children: [_jsxs("div", { className: "space-y-2", children: [_jsx(Label, { htmlFor: "totp-code", children: "Verification Code" }), _jsx(Input, { id: "totp-code", placeholder: "000000", value: totpCode, onChange: (e) => setTotpCode(e.target.value), maxLength: 6, className: "text-center text-lg tracking-widest", onKeyDown: (e) => {
                                            if (e.key === "Enter" && totpCode.length === 6) {
                                                handle2FAVerify();
                                            }
                                        } })] }), _jsx(Button, { className: "w-full", onClick: handle2FAVerify, disabled: totpCode.length !== 6 || isVerifying2FA, children: isVerifying2FA ? "Verifying..." : "Verify" }), _jsx(Button, { variant: "ghost", className: "w-full", onClick: () => {
                                    setNeeds2FA(false);
                                    setTotpCode("");
                                }, children: "Back to sign in" })] })] }) }));
    }
    if (forceSso && ssoEnabled) {
        return (_jsx("div", { className: "flex min-h-[80vh] items-center justify-center px-4", children: _jsxs(Card, { className: "w-full max-w-md", children: [_jsxs(CardHeader, { className: "text-center", children: [_jsx(CardTitle, { className: "text-2xl", children: "Sign In" }), _jsx(CardDescription, { children: "Use your organization account to continue" })] }), _jsx(CardContent, { children: _jsxs(Button, { className: "w-full", onClick: handleSsoLogin, children: ["Sign in with ", ssoProviderName] }) })] }) }));
    }
    return (_jsx("div", { className: "flex min-h-[80vh] items-center justify-center px-4", children: _jsxs(Card, { className: "w-full max-w-md", children: [_jsxs(CardHeader, { className: "text-center", children: [_jsx(CardTitle, { className: "text-2xl", children: mode === "signin" ? "Welcome Back" : "Create Account" }), _jsx(CardDescription, { children: mode === "signin"
                                ? "Sign in to your account"
                                : "Create a new account to get started" })] }), _jsxs(CardContent, { className: "space-y-4", children: [ssoEnabled && (_jsxs(_Fragment, { children: [_jsxs(Button, { variant: "outline", className: "w-full", onClick: handleSsoLogin, children: ["Continue with ", ssoProviderName] }), _jsxs("div", { className: "relative", children: [_jsx("div", { className: "absolute inset-0 flex items-center", children: _jsx("span", { className: "w-full border-t" }) }), _jsx("div", { className: "relative flex justify-center text-xs uppercase", children: _jsx("span", { className: "bg-card px-2 text-muted-foreground", children: "or" }) })] })] })), mode === "signin" ? (_jsx(SignInForm, { onNeeds2FA: () => setNeeds2FA(true) })) : (_jsx(SignUpForm, {})), _jsx("div", { className: "text-center", children: _jsx(Button, { variant: "link", onClick: () => setMode(mode === "signin" ? "signup" : "signin"), children: mode === "signin"
                                    ? "Need an account? Sign Up"
                                    : "Already have an account? Sign In" }) })] })] }) }));
}
function SignInForm({ onNeeds2FA }) {
    const navigate = useNavigate();
    const form = useForm({
        defaultValues: { email: "", password: "" },
        onSubmit: async ({ value }) => {
            const result = await authClient.signIn.email({
                email: value.email,
                password: value.password,
            });
            if (result.error) {
                toast.error(result.error.message || "Sign in failed");
                return;
            }
            if (result.data?.twoFactorRedirect) {
                onNeeds2FA();
                return;
            }
            navigate({ to: "/dashboard" });
            toast.success("Signed in successfully");
        },
        validators: {
            onSubmit: z.object({
                email: z.email("Invalid email address"),
                password: z.string().min(8, "Password must be at least 8 characters"),
            }),
        },
    });
    return (_jsxs("form", { onSubmit: (e) => {
            e.preventDefault();
            e.stopPropagation();
            form.handleSubmit();
        }, className: "space-y-4", children: [_jsx(form.Field, { name: "email", children: (field) => (_jsxs("div", { className: "space-y-2", children: [_jsx(Label, { htmlFor: field.name, children: "Email" }), _jsx(Input, { id: field.name, name: field.name, type: "email", value: field.state.value, onBlur: field.handleBlur, onChange: (e) => field.handleChange(e.target.value) }), field.state.meta.errors.map((error) => (_jsx("p", { className: "text-sm text-destructive", children: error?.message }, error?.message)))] })) }), _jsx(form.Field, { name: "password", children: (field) => (_jsxs("div", { className: "space-y-2", children: [_jsx(Label, { htmlFor: field.name, children: "Password" }), _jsx(Input, { id: field.name, name: field.name, type: "password", value: field.state.value, onBlur: field.handleBlur, onChange: (e) => field.handleChange(e.target.value) }), field.state.meta.errors.map((error) => (_jsx("p", { className: "text-sm text-destructive", children: error?.message }, error?.message)))] })) }), _jsx(form.Subscribe, { selector: (state) => ({ canSubmit: state.canSubmit, isSubmitting: state.isSubmitting }), children: ({ canSubmit, isSubmitting }) => (_jsx(Button, { type: "submit", className: "w-full", disabled: !canSubmit || isSubmitting, children: isSubmitting ? "Signing in..." : "Sign In" })) })] }));
}
function SignUpForm() {
    const navigate = useNavigate();
    const form = useForm({
        defaultValues: { name: "", email: "", password: "" },
        onSubmit: async ({ value }) => {
            const result = await authClient.signUp.email({
                email: value.email,
                password: value.password,
                name: value.name,
            });
            if (result.error) {
                toast.error(result.error.message || "Sign up failed");
                return;
            }
            navigate({ to: "/dashboard" });
            toast.success("Account created successfully");
        },
        validators: {
            onSubmit: z.object({
                name: z.string().min(2, "Name must be at least 2 characters"),
                email: z.email("Invalid email address"),
                password: z.string().min(8, "Password must be at least 8 characters"),
            }),
        },
    });
    return (_jsxs("form", { onSubmit: (e) => {
            e.preventDefault();
            e.stopPropagation();
            form.handleSubmit();
        }, className: "space-y-4", children: [_jsx(form.Field, { name: "name", children: (field) => (_jsxs("div", { className: "space-y-2", children: [_jsx(Label, { htmlFor: field.name, children: "Name" }), _jsx(Input, { id: field.name, name: field.name, value: field.state.value, onBlur: field.handleBlur, onChange: (e) => field.handleChange(e.target.value) }), field.state.meta.errors.map((error) => (_jsx("p", { className: "text-sm text-destructive", children: error?.message }, error?.message)))] })) }), _jsx(form.Field, { name: "email", children: (field) => (_jsxs("div", { className: "space-y-2", children: [_jsx(Label, { htmlFor: field.name, children: "Email" }), _jsx(Input, { id: field.name, name: field.name, type: "email", value: field.state.value, onBlur: field.handleBlur, onChange: (e) => field.handleChange(e.target.value) }), field.state.meta.errors.map((error) => (_jsx("p", { className: "text-sm text-destructive", children: error?.message }, error?.message)))] })) }), _jsx(form.Field, { name: "password", children: (field) => (_jsxs("div", { className: "space-y-2", children: [_jsx(Label, { htmlFor: field.name, children: "Password" }), _jsx(Input, { id: field.name, name: field.name, type: "password", value: field.state.value, onBlur: field.handleBlur, onChange: (e) => field.handleChange(e.target.value) }), field.state.meta.errors.map((error) => (_jsx("p", { className: "text-sm text-destructive", children: error?.message }, error?.message)))] })) }), _jsx(form.Subscribe, { selector: (state) => ({ canSubmit: state.canSubmit, isSubmitting: state.isSubmitting }), children: ({ canSubmit, isSubmitting }) => (_jsx(Button, { type: "submit", className: "w-full", disabled: !canSubmit || isSubmitting, children: isSubmitting ? "Creating account..." : "Sign Up" })) })] }));
}
