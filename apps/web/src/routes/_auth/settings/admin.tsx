import { Button } from "@myagents/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@myagents/ui/components/card";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Shield } from "lucide-react";
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
  const force2FA = appSettings.data?.force2fa === "true";
  const adminHas2FA = session.user.twoFactorEnabled === true;

  const updateSetting = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      return orpc.settings.update.call({ key, value });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orpc.settings.getAll.queryOptions().queryKey });
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

  return (
    <div className="space-y-6">
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
    </div>
  );
}
