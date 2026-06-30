"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import {
  Bell,
  ChevronRight,
  LogOut,
  Menu,
  Search,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface AdminTopbarProps {
  onSidebarToggle: () => void;
}

interface NotificationItem {
  type: string;
  count: number;
  label: string;
  href: string;
  severity: "critical" | "warning" | "info";
}

interface NotificationsResponse {
  total: number;
  items: NotificationItem[];
}

const NOTIFICATIONS_POLL_MS = 30000;

// Label overrides for segments that shouldn't be naively title-cased
// (e.g. "seo" → "SEO Fix" to match the sidebar and page heading).
const SEGMENT_LABELS: Record<string, string> = {
  seo: "SEO Fix",
};

function buildBreadcrumbs(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  const crumbs: { label: string; href: string }[] = [];

  let currentPath = "";
  for (const segment of segments) {
    currentPath += `/${segment}`;
    const label =
      SEGMENT_LABELS[segment] ??
      segment.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    crumbs.push({ label, href: currentPath });
  }

  return crumbs;
}

function getInitials(name: string | undefined | null): string {
  if (!name) return "U";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function severityDot(severity: NotificationItem["severity"]): string {
  switch (severity) {
    case "critical":
      return "bg-red-500";
    case "warning":
      return "bg-amber-500";
    default:
      return "bg-blue-500";
  }
}

export function AdminTopbar({ onSidebarToggle }: AdminTopbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const breadcrumbs = buildBreadcrumbs(pathname);

  const [notifications, setNotifications] = useState<NotificationsResponse>({
    total: 0,
    items: [],
  });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/notifications", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as NotificationsResponse;
        if (!cancelled) setNotifications(data);
      } catch {
        // Silent — best effort
      }
    }
    load();
    const id = setInterval(load, NOTIFICATIONS_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // Only show items with a non-zero count in the dropdown
  const activeItems = notifications.items.filter((item) => item.count > 0);
  const hasCritical = activeItems.some((i) => i.severity === "critical");

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b bg-background px-4">
      {/* Sidebar toggle */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onSidebarToggle}
        aria-label="Toggle sidebar"
      >
        <Menu className="size-4" />
      </Button>

      {/* Breadcrumb */}
      <nav className="hidden items-center gap-1 text-sm md:flex">
        {breadcrumbs.map((crumb, i) => (
          <span key={crumb.href} className="flex items-center gap-1">
            {i > 0 && (
              <ChevronRight className="size-3 text-muted-foreground" />
            )}
            <span
              className={cn(
                i === breadcrumbs.length - 1
                  ? "font-medium text-foreground"
                  : "text-muted-foreground",
              )}
            >
              {crumb.label}
            </span>
          </span>
        ))}
      </nav>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Search */}
      <div className="relative hidden w-64 lg:block">
        <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search..." className="pl-8" />
      </div>

      {/* Notification bell — real data, dropdown shows breakdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            aria-label={`${notifications.total} notification${notifications.total === 1 ? "" : "s"}`}
          >
            <Bell className="size-4" />
            {notifications.total > 0 && (
              <Badge
                variant={hasCritical ? "destructive" : "default"}
                className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full p-0 text-[0.6rem]"
              >
                {notifications.total > 99 ? "99+" : notifications.total}
              </Badge>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={8} className="w-80">
          <DropdownMenuLabel className="flex items-center justify-between">
            <span>Notifications</span>
            {notifications.total > 0 && (
              <span className="text-xs font-normal text-muted-foreground">
                {notifications.total} pending
              </span>
            )}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />

          {activeItems.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              You&apos;re all caught up.
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              {activeItems.map((item) => (
                <DropdownMenuItem
                  key={item.type}
                  className="flex items-start gap-2 py-2.5 cursor-pointer"
                  onClick={() => router.push(item.href)}
                >
                  <span
                    className={cn(
                      "mt-1.5 size-2 shrink-0 rounded-full",
                      severityDot(item.severity),
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{item.label}</span>
                      <Badge
                        variant={
                          item.severity === "critical"
                            ? "destructive"
                            : item.severity === "warning"
                              ? "secondary"
                              : "outline"
                        }
                        className="shrink-0"
                      >
                        {item.count}
                      </Badge>
                    </div>
                  </div>
                </DropdownMenuItem>
              ))}
            </div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* User dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2 rounded-md p-1 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">
            <Avatar className="h-8 w-8">
              <AvatarFallback>
                {getInitials(session?.user?.name)}
              </AvatarFallback>
            </Avatar>
            <div className="hidden flex-col items-start text-left md:flex">
              <span className="text-xs font-medium leading-none">
                {session?.user?.name ?? "User"}
              </span>
              <span className="text-[0.65rem] text-muted-foreground">
                {(session?.user as { role?: string })?.role ?? "Admin"}
              </span>
            </div>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="bottom" sideOffset={8}>
          <DropdownMenuLabel>My Account</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem>
            <User className="size-4" />
            Profile
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive"
            onClick={() => signOut({ callbackUrl: "/login" })}
          >
            <LogOut className="size-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}