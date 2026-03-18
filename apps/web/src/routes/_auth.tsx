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
    return (
      <div className="container mx-auto max-w-4xl px-4 py-8 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-5 w-64" />
        <div className="mt-8 space-y-3">
          <Skeleton className="h-32 w-full rounded-lg" />
          <Skeleton className="h-32 w-full rounded-lg" />
        </div>
      </div>
    );
  }

  const force2FA = appSettings.data?.force2fa === "true";
  const has2FA = session.user.twoFactorEnabled === true;

  if (force2FA && !has2FA) {
    return <TwoFactorSetupRequired />;
  }

  return <Outlet />;
}

function TwoFactorSetupRequired() {
  const [step, setStep] = useState<"intro" | "setup" | "verify">("intro");
  const [totpURI, setTotpURI] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
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
    } finally {
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
    } finally {
      setIsLoading(false);
    }
  };

  const secretFromURI = totpURI ? new URL(totpURI).searchParams.get("secret") || "" : "";

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Two-Factor Authentication Required</CardTitle>
          <CardDescription>
            Your organization requires two-factor authentication. Please set it up to continue.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === "intro" && (
            <>
              <p className="text-sm text-muted-foreground">
                You'll need an authenticator app like Authy, Google Authenticator, or 1Password to
                generate verification codes.
              </p>
              <Button className="w-full" onClick={() => setStep("setup")}>
                Set Up 2FA
              </Button>
            </>
          )}

          {step === "setup" && (
            <>
              <p className="text-sm text-muted-foreground">
                Enter your password to begin setup.
              </p>
              <div className="space-y-2">
                <Label htmlFor="2fa-password">Password</Label>
                <Input
                  id="2fa-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleEnable();
                  }}
                />
              </div>
              <Button className="w-full" onClick={handleEnable} disabled={!password || isLoading}>
                {isLoading ? "Setting up..." : "Continue"}
              </Button>
            </>
          )}

          {step === "verify" && (
            <>
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Add this key to your authenticator app:
                </p>
                <code className="block break-all rounded bg-muted p-3 text-center text-sm font-mono">
                  {secretFromURI}
                </code>
              </div>

              {backupCodes.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Backup codes (save these):</p>
                  <div className="grid grid-cols-2 gap-1 rounded bg-muted p-3">
                    {backupCodes.map((code) => (
                      <code key={code} className="text-xs font-mono">
                        {code}
                      </code>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="verify-code">Verification Code</Label>
                <Input
                  id="verify-code"
                  placeholder="000000"
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value)}
                  maxLength={6}
                  className="text-center text-lg tracking-widest"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && verifyCode.length === 6) handleVerify();
                  }}
                />
              </div>
              <Button
                className="w-full"
                onClick={handleVerify}
                disabled={verifyCode.length !== 6 || isLoading}
              >
                {isLoading ? "Verifying..." : "Verify & Enable"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
