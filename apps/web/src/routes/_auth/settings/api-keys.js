import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Button } from "@myagents/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, } from "@myagents/ui/components/card";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, } from "@myagents/ui/components/dialog";
import { Input } from "@myagents/ui/components/input";
import { Label } from "@myagents/ui/components/label";
import { Skeleton } from "@myagents/ui/components/skeleton";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Copy, KeyRound, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { orpc, queryClient } from "@/utils/orpc";
export const Route = createFileRoute("/_auth/settings/api-keys")({
    component: ApiKeysSettings,
});
function ApiKeysSettings() {
    return (_jsxs("div", { className: "space-y-6", children: [_jsx(CreateKeySection, {}), _jsx(KeyListSection, {})] }));
}
function CreateKeySection() {
    const [name, setName] = useState("");
    const [createdKey, setCreatedKey] = useState(null);
    const [copied, setCopied] = useState(false);
    const createKey = useMutation({
        mutationFn: async (input) => orpc.apiKeys.create.call(input),
        onSuccess: (data) => {
            setCreatedKey(data.key);
            setName("");
            queryClient.invalidateQueries({
                queryKey: orpc.apiKeys.list.queryOptions().queryKey,
            });
        },
    });
    const handleCreate = () => {
        if (!name.trim())
            return;
        createKey.mutate({ name: name.trim() }, {
            onError: (error) => toast.error(error.message),
        });
    };
    const handleCopy = () => {
        if (!createdKey)
            return;
        navigator.clipboard.writeText(createdKey);
        setCopied(true);
        toast.success("API key copied to clipboard");
        setTimeout(() => setCopied(false), 2000);
    };
    return (_jsxs(Card, { children: [_jsxs(CardHeader, { children: [_jsxs(CardTitle, { className: "flex items-center gap-2", children: [_jsx(KeyRound, { className: "h-5 w-5" }), "API Keys"] }), _jsx(CardDescription, { children: "Create API keys to authenticate CLI connections to MyAgents." })] }), _jsx(CardContent, { className: "space-y-4", children: createdKey ? (_jsxs("div", { className: "space-y-3", children: [_jsxs("div", { className: "rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-4", children: [_jsx("p", { className: "text-sm font-medium text-yellow-600 dark:text-yellow-400 mb-2", children: "Make sure to copy your API key now. You won't be able to see it again." }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("code", { className: "flex-1 rounded-md border bg-muted px-3 py-2 text-sm font-mono break-all select-all", children: createdKey }), _jsx(Button, { variant: "outline", size: "icon", onClick: handleCopy, "aria-label": "Copy API key", children: _jsx(Copy, { className: "h-4 w-4" }) })] })] }), _jsx(Button, { variant: "outline", onClick: () => setCreatedKey(null), children: copied ? "Done" : "Dismiss" })] })) : (_jsxs("div", { className: "flex items-end gap-2 max-w-md", children: [_jsxs("div", { className: "flex-1 space-y-2", children: [_jsx(Label, { htmlFor: "key-name", children: "Key name" }), _jsx(Input, { id: "key-name", placeholder: "e.g. My Laptop", value: name, onChange: (e) => setName(e.target.value), onKeyDown: (e) => {
                                        if (e.key === "Enter")
                                            handleCreate();
                                    } })] }), _jsxs(Button, { onClick: handleCreate, disabled: !name.trim() || createKey.isPending, children: [_jsx(Plus, { className: "h-4 w-4 mr-1" }), createKey.isPending ? "Creating..." : "Create"] })] })) })] }));
}
function KeyListSection() {
    const keysQuery = useQuery(orpc.apiKeys.list.queryOptions());
    const revokeKey = useMutation({
        mutationFn: async (input) => orpc.apiKeys.revoke.call(input),
        onSuccess: () => {
            queryClient.invalidateQueries({
                queryKey: orpc.apiKeys.list.queryOptions().queryKey,
            });
            toast.success("API key revoked");
        },
        onError: (error) => toast.error(error.message),
    });
    if (keysQuery.isLoading) {
        return (_jsxs(Card, { children: [_jsx(CardHeader, { children: _jsx(CardTitle, { children: "Your API Keys" }) }), _jsx(CardContent, { className: "space-y-3", children: Array.from({ length: 3 }).map((_, i) => (_jsxs("div", { className: "flex items-center justify-between rounded-lg border p-4", children: [_jsxs("div", { className: "space-y-2", children: [_jsx(Skeleton, { className: "h-4 w-32" }), _jsx(Skeleton, { className: "h-3 w-48" })] }), _jsx(Skeleton, { className: "h-8 w-8" })] }, i))) })] }));
    }
    const keys = keysQuery.data ?? [];
    return (_jsxs(Card, { children: [_jsxs(CardHeader, { children: [_jsx(CardTitle, { children: "Your API Keys" }), _jsx(CardDescription, { children: keys.length === 0
                            ? "No API keys yet. Create one to get started."
                            : `${keys.length} key${keys.length === 1 ? "" : "s"}` })] }), keys.length > 0 && (_jsx(CardContent, { className: "space-y-2", children: keys.map((key) => (_jsxs("div", { className: "flex items-center justify-between rounded-lg border p-4", children: [_jsxs("div", { className: "space-y-1 min-w-0", children: [_jsx("p", { className: "font-medium text-sm", children: key.name }), _jsxs("p", { className: "text-xs text-muted-foreground", children: ["Created", " ", new Date(key.createdAt).toLocaleDateString(undefined, {
                                            year: "numeric",
                                            month: "short",
                                            day: "numeric",
                                        }), key.lastUsedAt && (_jsxs(_Fragment, { children: [" ", "\u00B7 Last used", " ", new Date(key.lastUsedAt).toLocaleDateString(undefined, {
                                                    year: "numeric",
                                                    month: "short",
                                                    day: "numeric",
                                                })] }))] })] }), _jsx(RevokeKeyDialog, { keyName: key.name, onConfirm: () => revokeKey.mutate({ id: key.id }), isPending: revokeKey.isPending })] }, key.id))) }))] }));
}
function RevokeKeyDialog({ keyName, onConfirm, isPending, }) {
    const [open, setOpen] = useState(false);
    return (_jsxs(Dialog, { open: open, onOpenChange: setOpen, children: [_jsx(DialogTrigger, { render: _jsx(Button, { variant: "ghost", size: "icon", "aria-label": `Revoke ${keyName}` }), children: _jsx(Trash2, { className: "h-4 w-4 text-muted-foreground" }) }), _jsxs(DialogContent, { children: [_jsxs(DialogHeader, { children: [_jsx(DialogTitle, { children: "Revoke API Key" }), _jsxs(DialogDescription, { children: ["Are you sure you want to revoke \"", keyName, "\"? Any CLI connections using this key will stop working immediately."] })] }), _jsxs(DialogFooter, { children: [_jsx(DialogClose, { render: _jsx(Button, { variant: "outline" }), children: "Cancel" }), _jsx(Button, { variant: "destructive", onClick: () => {
                                    onConfirm();
                                    setOpen(false);
                                }, disabled: isPending, children: isPending ? "Revoking..." : "Revoke" })] })] })] }));
}
