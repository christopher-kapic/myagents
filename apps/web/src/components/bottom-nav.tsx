import { Link } from "@tanstack/react-router";
import { LayoutDashboard, Settings } from "lucide-react";

const navItems = [
  { to: "/dashboard" as const, label: "Dashboard", icon: LayoutDashboard },
  { to: "/settings" as const, label: "Settings", icon: Settings },
];

export default function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/80 backdrop-blur-lg md:hidden"
      style={{ paddingBottom: "var(--safe-area-bottom)" }}
    >
      <div className="flex items-center justify-around h-14">
        {navItems.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 text-muted-foreground transition-colors min-w-[64px] min-h-[44px]"
            activeProps={{
              className:
                "flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 text-primary transition-colors min-w-[64px] min-h-[44px]",
            }}
          >
            <item.icon className="h-5 w-5" />
            <span className="text-[10px] font-medium leading-tight">{item.label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
