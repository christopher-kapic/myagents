import { Button } from "@myagents/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@myagents/ui/components/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@myagents/ui/components/dialog";
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
  return (
    <div className="space-y-6">
      <CreateKeySection />
      <KeyListSection />
    </div>
  );
}

function CreateKeySection() {
  const [name, setName] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const createKey = useMutation({
    mutationFn: async (input: { name: string }) =>
      orpc.apiKeys.create.call(input),
    onSuccess: (data) => {
      setCreatedKey(data.key);
      setName("");
      queryClient.invalidateQueries({
        queryKey: orpc.apiKeys.list.queryOptions().queryKey,
      });
    },
  });

  const handleCreate = () => {
    if (!name.trim()) return;
    createKey.mutate(
      { name: name.trim() },
      {
        onError: (error) => toast.error(error.message),
      },
    );
  };

  const handleCopy = () => {
    if (!createdKey) return;
    navigator.clipboard.writeText(createdKey);
    setCopied(true);
    toast.success("API key copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-5 w-5" />
          API Keys
        </CardTitle>
        <CardDescription>
          Create API keys to authenticate CLI connections to MyAgents.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {createdKey ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-4">
              <p className="text-sm font-medium text-yellow-600 dark:text-yellow-400 mb-2">
                Make sure to copy your API key now. You won't be able to see it
                again.
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-md border bg-muted px-3 py-2 text-sm font-mono break-all select-all">
                  {createdKey}
                </code>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleCopy}
                  aria-label="Copy API key"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <Button variant="outline" onClick={() => setCreatedKey(null)}>
              {copied ? "Done" : "Dismiss"}
            </Button>
          </div>
        ) : (
          <div className="flex items-end gap-2 max-w-md">
            <div className="flex-1 space-y-2">
              <Label htmlFor="key-name">Key name</Label>
              <Input
                id="key-name"
                placeholder="e.g. My Laptop"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                }}
              />
            </div>
            <Button
              onClick={handleCreate}
              disabled={!name.trim() || createKey.isPending}
            >
              <Plus className="h-4 w-4 mr-1" />
              {createKey.isPending ? "Creating..." : "Create"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function KeyListSection() {
  const keysQuery = useQuery(orpc.apiKeys.list.queryOptions());

  const revokeKey = useMutation({
    mutationFn: async (input: { id: string }) =>
      orpc.apiKeys.revoke.call(input),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: orpc.apiKeys.list.queryOptions().queryKey,
      });
      toast.success("API key revoked");
    },
    onError: (error) => toast.error(error.message),
  });

  if (keysQuery.isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Your API Keys</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
              <Skeleton className="h-8 w-8" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  const keys = keysQuery.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your API Keys</CardTitle>
        <CardDescription>
          {keys.length === 0
            ? "No API keys yet. Create one to get started."
            : `${keys.length} key${keys.length === 1 ? "" : "s"}`}
        </CardDescription>
      </CardHeader>
      {keys.length > 0 && (
        <CardContent className="space-y-2">
          {keys.map((key) => (
            <div
              key={key.id}
              className="flex items-center justify-between rounded-lg border p-4"
            >
              <div className="space-y-1 min-w-0">
                <p className="font-medium text-sm">{key.name}</p>
                <p className="text-xs text-muted-foreground">
                  Created{" "}
                  {new Date(key.createdAt).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                  {key.lastUsedAt && (
                    <>
                      {" "}
                      &middot; Last used{" "}
                      {new Date(key.lastUsedAt).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </>
                  )}
                </p>
              </div>
              <RevokeKeyDialog
                keyName={key.name}
                onConfirm={() => revokeKey.mutate({ id: key.id })}
                isPending={revokeKey.isPending}
              />
            </div>
          ))}
        </CardContent>
      )}
    </Card>
  );
}

function RevokeKeyDialog({
  keyName,
  onConfirm,
  isPending,
}: {
  keyName: string;
  onConfirm: () => void;
  isPending: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="ghost" size="icon" aria-label={`Revoke ${keyName}`} />
        }
      >
        <Trash2 className="h-4 w-4 text-muted-foreground" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Revoke API Key</DialogTitle>
          <DialogDescription>
            Are you sure you want to revoke "{keyName}"? Any CLI connections
            using this key will stop working immediately.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            Cancel
          </DialogClose>
          <Button
            variant="destructive"
            onClick={() => {
              onConfirm();
              setOpen(false);
            }}
            disabled={isPending}
          >
            {isPending ? "Revoking..." : "Revoke"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
