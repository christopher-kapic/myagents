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

const loginSearchSchema = z.object({
  invitation: z.string().optional(),
});

export const Route = createFileRoute("/login")({
  validateSearch: loginSearchSchema,
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (session.data) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: LoginPage,
});

function LoginPage() {
  const { invitation: invitationToken } = Route.useSearch();
  const [mode, setMode] = useState<"signin" | "signup">(invitationToken ? "signup" : "signin");
  const [needs2FA, setNeeds2FA] = useState(false);
  const [totpCode, setTotpCode] = useState("");
  const [isVerifying2FA, setIsVerifying2FA] = useState(false);
  const navigate = useNavigate();
  const { isPending } = authClient.useSession();
  const config = useQuery(orpc.appConfig.queryOptions());

  const invitationResult = useQuery({
    ...orpc.invitations.accept.queryOptions({ input: { token: invitationToken! } }),
    enabled: !!invitationToken,
  });

  const ssoEnabled = config.data?.ssoEnabled ?? false;
  const forceSso = config.data?.forceSso ?? false;
  const ssoProviderName = config.data?.ssoProviderName ?? "SSO";
  const signupsDisabled = config.data?.signupsDisabled ?? false;

  const invitationValid = invitationResult.data?.valid ?? false;
  const invitationEmail = invitationResult.data?.email ?? "";

  if (isPending || config.isLoading || (invitationToken && invitationResult.isLoading)) {
    return (
      <div className="flex min-h-[80vh] items-center justify-center px-4">
        <div className="w-full max-w-md space-y-6">
          <div className="space-y-2 text-center">
            <Skeleton className="mx-auto h-8 w-40" />
            <Skeleton className="mx-auto h-4 w-56" />
          </div>
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>
      </div>
    );
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
      } else {
        navigate({ to: "/dashboard" });
        toast.success("Signed in successfully");
      }
    } finally {
      setIsVerifying2FA(false);
    }
  };

  if (needs2FA) {
    return (
      <div className="flex min-h-[80vh] items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Two-Factor Authentication</CardTitle>
            <CardDescription>Enter the code from your authenticator app</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="totp-code">Verification Code</Label>
              <Input
                id="totp-code"
                placeholder="000000"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                maxLength={6}
                className="text-center text-lg tracking-widest"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && totpCode.length === 6) {
                    handle2FAVerify();
                  }
                }}
              />
            </div>
            <Button
              className="w-full"
              onClick={handle2FAVerify}
              disabled={totpCode.length !== 6 || isVerifying2FA}
            >
              {isVerifying2FA ? "Verifying..." : "Verify"}
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => {
                setNeeds2FA(false);
                setTotpCode("");
              }}
            >
              Back to sign in
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (forceSso && ssoEnabled) {
    return (
      <div className="flex min-h-[80vh] items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Sign In</CardTitle>
            <CardDescription>Use your organization account to continue</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={handleSsoLogin}>
              Sign in with {ssoProviderName}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const canSignUp = !signupsDisabled || invitationValid;
  const showSignupForm = mode === "signup" && canSignUp;

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">
            {mode === "signin" ? "Welcome Back" : "Create Account"}
          </CardTitle>
          <CardDescription>
            {mode === "signin"
              ? "Sign in to your account"
              : invitationValid
                ? `Create your account for ${invitationEmail}`
                : "Create a new account to get started"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {ssoEnabled && (
            <>
              <Button variant="outline" className="w-full" onClick={handleSsoLogin}>
                Continue with {ssoProviderName}
              </Button>
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">or</span>
                </div>
              </div>
            </>
          )}
          {mode === "signin" ? (
            <SignInForm onNeeds2FA={() => setNeeds2FA(true)} />
          ) : showSignupForm ? (
            <SignUpForm
              defaultEmail={invitationValid ? invitationEmail : ""}
              emailReadOnly={invitationValid}
            />
          ) : (
            <p className="text-center text-sm text-muted-foreground">
              Signups are currently disabled. Contact an administrator to request an invitation.
            </p>
          )}
          {canSignUp && (
            <div className="text-center">
              <Button variant="link" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
                {mode === "signin"
                  ? "Need an account? Sign Up"
                  : "Already have an account? Sign In"}
              </Button>
            </div>
          )}
          {!canSignUp && mode === "signin" && (
            <div className="text-center">
              <Button variant="link" onClick={() => setMode("signup")}>
                Need an account? Sign Up
              </Button>
            </div>
          )}
          {!canSignUp && mode === "signup" && (
            <div className="text-center">
              <Button variant="link" onClick={() => setMode("signin")}>
                Already have an account? Sign In
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SignInForm({ onNeeds2FA }: { onNeeds2FA: () => void }) {
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
      if ((result.data as any)?.twoFactorRedirect) {
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

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        form.handleSubmit();
      }}
      className="space-y-4"
    >
      <form.Field name="email">
        {(field) => (
          <div className="space-y-2">
            <Label htmlFor={field.name}>Email</Label>
            <Input
              id={field.name}
              name={field.name}
              type="email"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
            />
            {field.state.meta.errors.map((error) => (
              <p key={error?.message} className="text-sm text-destructive">
                {error?.message}
              </p>
            ))}
          </div>
        )}
      </form.Field>

      <form.Field name="password">
        {(field) => (
          <div className="space-y-2">
            <Label htmlFor={field.name}>Password</Label>
            <Input
              id={field.name}
              name={field.name}
              type="password"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
            />
            {field.state.meta.errors.map((error) => (
              <p key={error?.message} className="text-sm text-destructive">
                {error?.message}
              </p>
            ))}
          </div>
        )}
      </form.Field>

      <form.Subscribe
        selector={(state) => ({ canSubmit: state.canSubmit, isSubmitting: state.isSubmitting })}
      >
        {({ canSubmit, isSubmitting }) => (
          <Button type="submit" className="w-full" disabled={!canSubmit || isSubmitting}>
            {isSubmitting ? "Signing in..." : "Sign In"}
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
}

function SignUpForm({
  defaultEmail,
  emailReadOnly,
}: {
  defaultEmail: string;
  emailReadOnly: boolean;
}) {
  const navigate = useNavigate();

  const form = useForm({
    defaultValues: { name: "", email: defaultEmail, password: "" },
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

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        form.handleSubmit();
      }}
      className="space-y-4"
    >
      <form.Field name="name">
        {(field) => (
          <div className="space-y-2">
            <Label htmlFor={field.name}>Name</Label>
            <Input
              id={field.name}
              name={field.name}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
            />
            {field.state.meta.errors.map((error) => (
              <p key={error?.message} className="text-sm text-destructive">
                {error?.message}
              </p>
            ))}
          </div>
        )}
      </form.Field>

      <form.Field name="email">
        {(field) => (
          <div className="space-y-2">
            <Label htmlFor={field.name}>Email</Label>
            <Input
              id={field.name}
              name={field.name}
              type="email"
              readOnly={emailReadOnly}
              className={emailReadOnly ? "bg-muted" : ""}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
            />
            {field.state.meta.errors.map((error) => (
              <p key={error?.message} className="text-sm text-destructive">
                {error?.message}
              </p>
            ))}
          </div>
        )}
      </form.Field>

      <form.Field name="password">
        {(field) => (
          <div className="space-y-2">
            <Label htmlFor={field.name}>Password</Label>
            <Input
              id={field.name}
              name={field.name}
              type="password"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
            />
            {field.state.meta.errors.map((error) => (
              <p key={error?.message} className="text-sm text-destructive">
                {error?.message}
              </p>
            ))}
          </div>
        )}
      </form.Field>

      <form.Subscribe
        selector={(state) => ({ canSubmit: state.canSubmit, isSubmitting: state.isSubmitting })}
      >
        {({ canSubmit, isSubmitting }) => (
          <Button type="submit" className="w-full" disabled={!canSubmit || isSubmitting}>
            {isSubmitting ? "Creating account..." : "Sign Up"}
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
}
