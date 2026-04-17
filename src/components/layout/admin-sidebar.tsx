"use client";


import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  FileText,
  Search,
  AlertTriangle,
  RefreshCw,
  CalendarClock,
  MessageSquare,
  Receipt,
  BarChart3,
  Activity,
  Settings,
  ChevronLeft,
  ChevronRight,
  Globe,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
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

interface NavGroup {
  label: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { title: "Dashboard", href: "/admin", icon: LayoutDashboard },
    ],
  },
  {
    label: "Manage",
    items: [
      { title: "Clients", href: "/admin/clients", icon: Users },
      { title: "Blogs", href: "/admin/blogs", icon: FileText },
      { title: "SEO", href: "/admin/seo", icon: Search },
      { title: "Fix Queue", href: "/admin/fix-queue", icon: AlertTriangle },
    ],
  },
  {
    label: "Operations",
    items: [
      { title: "Renewals", href: "/admin/renewals", icon: RefreshCw },
      { title: "Post Schedule", href: "/admin/post-schedule", icon: CalendarClock },
      { title: "Messages", href: "/admin/messages", icon: MessageSquare },
    ],
  },
  {
    label: "Finance",
    items: [
      { title: "Invoices", href: "/admin/invoices", icon: Receipt },
      { title: "Reports", href: "/admin/reports", icon: BarChart3 },
    ],
  },
  {
    label: "System",
    items: [
      { title: "Activity Log", href: "/admin/activity", icon: Activity },
      { title: "Settings", href: "/admin/settings", icon: Settings },
    ],
  },
];

interface AdminSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function AdminSidebar({ collapsed, onToggle }: AdminSidebarProps) {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/admin") return pathname === "/admin";
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
        <Link href="/admin" className="flex items-center gap-2 overflow-hidden">
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
          {navGroups.map((group, groupIndex) => (
            <div key={group.label}>
              {groupIndex > 0 && <Separator className="my-2" />}
              {!collapsed && (
                <span className="mb-1 block px-2 text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.label}
                </span>
              )}
              {group.items.map((item) => {
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

                return linkContent;
              })}
            </div>
          ))}
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
