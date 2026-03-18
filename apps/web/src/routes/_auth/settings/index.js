import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Button } from "@myagents/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@myagents/ui/components/card";
import { Input } from "@myagents/ui/components/input";
import { Label } from "@myagents/ui/components/label";
import { useForm } from "@tanstack/react-form";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import z from "zod";
import { authClient } from "@/lib/auth-client";
export const Route = createFileRoute("/_auth/settings/")({
    component: ProfileSettings,
});
function ProfileSettings() {
    const { session } = Route.useRouteContext();
    const form = useForm({
        defaultValues: {
            name: session.user.name || "",
        },
        onSubmit: async ({ value }) => {
            const result = await authClient.updateUser({
                name: value.name,
            });
            if (result.error) {
                toast.error(result.error.message || "Failed to update profile");
                return;
            }
            toast.success("Profile updated");
        },
        validators: {
            onSubmit: z.object({
                name: z.string().min(2, "Name must be at least 2 characters"),
            }),
        },
    });
    return (_jsxs(Card, { children: [_jsxs(CardHeader, { children: [_jsx(CardTitle, { children: "Profile" }), _jsx(CardDescription, { children: "Manage your profile information" })] }), _jsx(CardContent, { children: _jsxs("form", { onSubmit: (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        form.handleSubmit();
                    }, className: "space-y-4", children: [_jsxs("div", { className: "space-y-2", children: [_jsx(Label, { children: "Email" }), _jsx(Input, { value: session.user.email, disabled: true }), _jsx("p", { className: "text-xs text-muted-foreground", children: "Email cannot be changed" })] }), _jsx(form.Field, { name: "name", children: (field) => (_jsxs("div", { className: "space-y-2", children: [_jsx(Label, { htmlFor: field.name, children: "Name" }), _jsx(Input, { id: field.name, name: field.name, value: field.state.value, onBlur: field.handleBlur, onChange: (e) => field.handleChange(e.target.value) }), field.state.meta.errors.map((error) => (_jsx("p", { className: "text-sm text-destructive", children: error?.message }, error?.message)))] })) }), _jsx(form.Subscribe, { selector: (state) => ({
                                canSubmit: state.canSubmit,
                                isSubmitting: state.isSubmitting,
                            }), children: ({ canSubmit, isSubmitting }) => (_jsx(Button, { type: "submit", disabled: !canSubmit || isSubmitting, children: isSubmitting ? "Saving..." : "Save Changes" })) })] }) })] }));
}
