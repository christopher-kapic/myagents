import { Link } from "@tanstack/react-router";
import { Bot, LayoutDashboard, MessageSquare, Settings } from "lucide-react";
import { useEffect, useState } from "react";

const navItems = [
  { to: "/dashboard" as const, label: "Dashboard", icon: LayoutDashboard },
  { to: "/agents" as const, label: "Agents", icon: Bot },
  { to: "/conversations" as const, label: "Chats", icon: MessageSquare },
  { to: "/settings" as const, label: "Settings", icon: Settings },
];

export default function BottomNav() {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const vv = window.visualViewport;

    // Use visualViewport API to detect virtual keyboard (most reliable on iOS)
    if (vv) {
      const onResize = () => {
        const keyboardOpen = vv.height < window.innerHeight * 0.8;
        setHidden(keyboardOpen);
      };
      vv.addEventListener("resize", onResize);
      return () => vv.removeEventListener("resize", onResize);
    }

    // Fallback: focus-based detection
    const onFocusIn = (e: FocusEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") {
        setHidden(true);
      }
    };
    const onFocusOut = (e: FocusEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") {
        setHidden(false);
      }
    };
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, []);

  if (hidden) return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/80 backdrop-blur-lg md:hidden pb-[env(safe-area-inset-bottom,0px)]"
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
