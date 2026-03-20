import { Button } from "@myagents/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@myagents/ui/components/card";
import { Input } from "@myagents/ui/components/input";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Bell, Mail, Shield, UserPlus, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { orpc, queryClient } from "@/utils/orpc";

export const Route = createFileRoute("/_auth/settings/admin")({
  beforeLoad: async ({ context }) => {
    if ((context as any).session?.user?.role !== "admin") {
      throw redirect({ to: "/settings" });
    }
  },
  component: AdminSettings,
});

function AdminSettings() {
  const { session } = Route.useRouteContext();
  const appSettings = useQuery(orpc.settings.getAll.queryOptions());
  const appConfig = useQuery(orpc.appConfig.queryOptions());
  const force2FA = appSettings.data?.force2fa === "true";
  const signupsDisabled = appSettings.data?.signupsDisabled === "true";
  const adminHas2FA = session.user.twoFactorEnabled === true;
  const smtpConfigured = appConfig.data?.smtpConfigured ?? false;

  const testPush = useMutation({
    mutationFn: async () => {
      return orpc.push.send.call({
        title: "Test Notification",
        body: "This is a test push notification from MyAgents.",
        url: "/settings/admin",
      });
    },
    onSuccess: (data) => {
      if (data.sent === data.total) {
        toast.success(`Push notification sent to ${data.sent} of ${data.total} subscriptions`);
      } else {
        toast.error(`Push notification sent to ${data.sent} of ${data.total} subscriptions${data.errors?.length ? `: ${data.errors[0]}` : ""}`);
      }
    },
    onError: (error) => {
      toast.error(error.message || "Failed to send test notification");
    },
  });

  const updateSetting = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      return orpc.settings.update.call({ key, value });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orpc.settings.getAll.queryOptions().queryKey });
      queryClient.invalidateQueries({ queryKey: orpc.appConfig.queryOptions().queryKey });
    },
  });

  const handleToggleForce2FA = () => {
    const newValue = force2FA ? "false" : "true";
    updateSetting.mutate(
      { key: "force2fa", value: newValue },
      {
        onSuccess: () => {
          toast.success(
            newValue === "true"
              ? "Two-factor authentication is now required for all users"
              : "Two-factor authentication requirement removed",
          );
        },
        onError: (error) => {
          toast.error(error.message || "Failed to update setting");
        },
      },
    );
  };

  const handleToggleSignups = () => {
    const newValue = signupsDisabled ? "false" : "true";
    updateSetting.mutate(
      { key: "signupsDisabled", value: newValue },
      {
        onSuccess: () => {
          toast.success(
            newValue === "true"
              ? "Public signups are now disabled"
              : "Public signups are now enabled",
          );
        },
        onError: (error) => {
          toast.error(error.message || "Failed to update setting");
        },
      },
    );
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Signup Control
          </CardTitle>
          <CardDescription>Control who can create new accounts</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
            <div className="space-y-1">
              <p className="font-medium">Disable Public Signups</p>
              <p className="text-sm text-muted-foreground">
                When enabled, only users with a valid invitation can create an account.
              </p>
            </div>
            <Button
              variant={signupsDisabled ? "destructive" : "default"}
              size="sm"
              disabled={updateSetting.isPending || appSettings.isLoading}
              onClick={handleToggleSignups}
            >
              {updateSetting.isPending
                ? "Updating..."
                : signupsDisabled
                  ? "Allow Signups"
                  : "Disable Signups"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {smtpConfigured && <InvitationsCard />}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Security Policy
          </CardTitle>
          <CardDescription>Configure organization-wide security settings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
            <div className="space-y-1">
              <p className="font-medium">Force Two-Factor Authentication</p>
              <p className="text-sm text-muted-foreground">
                When enabled, all users must set up two-factor authentication before they can use
                the application.
              </p>
              {!adminHas2FA && (
                <p className="text-sm text-destructive">
                  You must enable 2FA for your own account before you can require it for others.
                  Go to Security settings to set it up.
                </p>
              )}
            </div>
            <Button
              variant={force2FA ? "destructive" : "default"}
              size="sm"
              disabled={(!adminHas2FA && !force2FA) || updateSetting.isPending || appSettings.isLoading}
              onClick={handleToggleForce2FA}
            >
              {updateSetting.isPending
                ? "Updating..."
                : force2FA
                  ? "Disable"
                  : "Enable"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Push Notifications
          </CardTitle>
          <CardDescription>Test push notification delivery to all registered devices</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
            <div className="space-y-1">
              <p className="font-medium">Test Push Notifications</p>
              <p className="text-sm text-muted-foreground">
                Send a test push notification to all users and all registered devices.
              </p>
            </div>
            <Button
              size="sm"
              disabled={testPush.isPending}
              onClick={() => testPush.mutate()}
            >
              {testPush.isPending ? "Sending..." : "Send Test"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

const statusStyles: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  accepted: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  expired: "bg-muted text-muted-foreground",
  revoked: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

function InvitationsCard() {
  const [email, setEmail] = useState("");
  const invitations = useQuery(orpc.invitations.list.queryOptions());

  const createInvitation = useMutation({
    mutationFn: async (inviteEmail: string) => {
      return orpc.invitations.create.call({ email: inviteEmail });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orpc.invitations.list.queryOptions().queryKey });
      setEmail("");
      toast.success("Invitation sent");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to send invitation");
    },
  });

  const revokeInvitation = useMutation({
    mutationFn: async (id: string) => {
      return orpc.invitations.revoke.call({ id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orpc.invitations.list.queryOptions().queryKey });
      toast.success("Invitation revoked");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to revoke invitation");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    createInvitation.mutate(email.trim());
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          User Invitations
        </CardTitle>
        <CardDescription>Invite users by email to create an account</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            type="email"
            placeholder="user@example.com"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="flex-1"
          />
          <Button type="submit" size="sm" disabled={!email.trim() || createInvitation.isPending}>
            {createInvitation.isPending ? "Sending..." : "Send Invite"}
          </Button>
        </form>

        {invitations.data && invitations.data.length > 0 && (
          <div className="space-y-2">
            {invitations.data.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between gap-4 rounded-lg border p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{inv.email}</p>
                  <p className="text-xs text-muted-foreground">
                    Invited by {inv.inviterName}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusStyles[inv.status] ?? ""}`}
                  >
                    {inv.status}
                  </span>
                  {inv.status === "pending" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      disabled={revokeInvitation.isPending}
                      onClick={() => revokeInvitation.mutate(inv.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
