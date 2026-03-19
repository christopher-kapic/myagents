import { Button } from "@myagents/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@myagents/ui/components/card";
import { createFileRoute } from "@tanstack/react-router";
import { Bell, BellOff, BellRing } from "lucide-react";

import { usePushNotifications } from "@/hooks/use-push-notifications";

export const Route = createFileRoute("/_auth/settings/notifications")({
  component: NotificationSettings,
});

function NotificationSettings() {
  const push = usePushNotifications();

  const isEnabled = push.permission === "granted";
  const isDenied = push.permission === "denied";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {isEnabled ? (
              <BellRing className="h-5 w-5 text-green-500" />
            ) : (
              <Bell className="h-5 w-5 text-muted-foreground" />
            )}
            Push Notifications
          </CardTitle>
          <CardDescription>
            {isEnabled
              ? "Push notifications are enabled. You'll receive alerts when agents respond."
              : "Get notified when your agents respond, go offline, or need attention."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!push.isSupported ? (
            <UnsupportedNotice />
          ) : isDenied ? (
            <DeniedNotice />
          ) : isEnabled ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-900 dark:bg-green-950">
                <BellRing className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0" />
                <p className="text-sm text-green-800 dark:text-green-200">
                  Notifications are active. You'll receive push notifications for agent activity.
                </p>
              </div>
              <Button
                variant="outline"
                onClick={push.unsubscribe}
                disabled={push.isUnsubscribing}
              >
                {push.isUnsubscribing ? "Disabling..." : "Disable Notifications"}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Enable push notifications to stay informed about agent responses and status
                changes, even when the app is in the background.
              </p>
              <Button onClick={push.subscribe} disabled={push.isSubscribing}>
                {push.isSubscribing ? "Enabling..." : "Enable Notifications"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notification Types</CardTitle>
          <CardDescription>
            When enabled, you'll receive notifications for:
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-primary">&#x2022;</span>
              <span><strong className="text-foreground">Agent responses</strong> &mdash; when an agent sends a message in a conversation</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-primary">&#x2022;</span>
              <span><strong className="text-foreground">Agent offline</strong> &mdash; when a connected agent disconnects unexpectedly</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-primary">&#x2022;</span>
              <span><strong className="text-foreground">Loop detection</strong> &mdash; when agent-to-agent messaging is paused due to a detected loop</span>
            </li>
          </ul>
        </CardContent>
      </Card>

      <IOSInstallNotice />
    </div>
  );
}

function UnsupportedNotice() {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-900 dark:bg-yellow-950">
      <BellOff className="h-5 w-5 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
      <div className="space-y-1">
        <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
          Not supported
        </p>
        <p className="text-sm text-yellow-700 dark:text-yellow-300">
          Push notifications are not supported in this browser. If you're on iOS, make sure
          you've installed the app to your Home Screen and are running iOS 16.4 or later.
        </p>
      </div>
    </div>
  );
}

function DeniedNotice() {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950">
      <BellOff className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
      <div className="space-y-1">
        <p className="text-sm font-medium text-red-800 dark:text-red-200">
          Permission denied
        </p>
        <p className="text-sm text-red-700 dark:text-red-300">
          Notification permission was denied. To re-enable, open your browser or device
          settings and allow notifications for this site.
        </p>
      </div>
    </div>
  );
}

function IOSInstallNotice() {
  const isIOS =
    typeof navigator !== "undefined" &&
    /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isStandalone =
    typeof window !== "undefined" &&
    (window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in navigator && (navigator as Record<string, unknown>).standalone === true));

  if (!isIOS || isStandalone) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">iOS Setup</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          To receive push notifications on iOS, you need to install this app to your Home
          Screen. Tap the <strong>Share</strong> button in Safari, then select{" "}
          <strong>Add to Home Screen</strong>. Push notifications require iOS 16.4 or later.
        </p>
      </CardContent>
    </Card>
  );
}
