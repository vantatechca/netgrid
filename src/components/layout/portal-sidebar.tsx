"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Search,
  BarChart3,
  Receipt,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  Globe,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const navItems: NavItem[] = [
  { title: "Dashboard", href: "/portal", icon: LayoutDashboard },
  { title: "SEO Health", href: "/portal/seo", icon: Search },
  { title: "Reports", href: "/portal/reports", icon: BarChart3 },
  { title: "Invoices", href: "/portal/invoices", icon: Receipt },
  { title: "Messages", href: "/portal/messages", icon: MessageSquare },
];

interface PortalSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function PortalSidebar({ collapsed, onToggle }: PortalSidebarProps) {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/portal") return pathname === "/portal";
    return pathname.startsWith(href);
  }

  return (
    <aside
      className={cn(
        "relative flex h-screen flex-col border-r bg-background transition-all duration-300",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Logo */}
      <div className="flex h-14 items-center border-b px-4">
        <Link href="/portal" className="flex items-center gap-2 overflow-hidden">
          <Globe className="size-6 shrink-0 text-primary" />
          {!collapsed && (
            <span className="text-lg font-semibold tracking-tight">
              NETGRID
            </span>
          )}
        </Link>
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 overflow-y-auto">
        <nav className="flex flex-col gap-1 p-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            const linkContent = (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-2 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  collapsed && "justify-center px-0"
                )}
              >
                <Icon className="size-4 shrink-0" />
                {!collapsed && <span>{item.title}</span>}
              </Link>
            );

            if (collapsed) {
              return (
                <Tooltip key={item.href}>
                  <TooltipTrigger asChild>
                    <div>{linkContent}</div>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    {item.title}
                  </TooltipContent>
                </Tooltip>
              );
            }

            return <div key={item.href}>{linkContent}</div>;
          })}
        </nav>
      </ScrollArea>

      {/* Collapse toggle */}
      <div className="border-t p-2">
        <Button
          variant="ghost"
          size="sm"
          className="w-full"
          onClick={onToggle}
        >
          {collapsed ? (
            <ChevronRight className="size-4" />
          ) : (
            <ChevronLeft className="size-4" />
          )}
        </Button>
      </div>
    </aside>
  );
}
