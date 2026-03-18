import { Link, Outlet, createFileRoute } from "@tanstack/react-router";
import { Settings, Shield, UserCog } from "lucide-react";

export const Route = createFileRoute("/_auth/settings")({
  component: SettingsLayout,
});

function SettingsLayout() {
  const { session } = Route.useRouteContext();
  const isAdmin = session.user.role === "admin";

  const navItems = [
    { to: "/settings", label: "Profile", icon: Settings, exact: true },
    { to: "/settings/security", label: "Security", icon: Shield, exact: false },
    ...(isAdmin
      ? [{ to: "/settings/admin" as const, label: "Admin", icon: UserCog, exact: false }]
      : []),
  ];

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>
      <div className="flex flex-col gap-6 md:flex-row md:gap-8">
        <nav className="w-full md:w-48 flex-shrink-0">
          <div className="flex flex-row gap-1 md:flex-col">
            {navItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: item.exact }}
                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                activeProps={{
                  className:
                    "flex items-center gap-2 rounded-md px-3 py-2 text-sm bg-accent text-accent-foreground transition-colors",
                }}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            ))}
          </div>
        </nav>
        <div className="flex-1 min-w-0">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
