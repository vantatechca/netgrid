"use client";

import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import {
  Menu,
  Search,
  Bell,
  LogOut,
  User,
  ChevronRight,
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

function buildBreadcrumbs(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  const crumbs: { label: string; href: string }[] = [];

  let currentPath = "";
  for (const segment of segments) {
    currentPath += `/${segment}`;
    const label = segment
      .replace(/-/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
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

export function AdminTopbar({ onSidebarToggle }: AdminTopbarProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const breadcrumbs = buildBreadcrumbs(pathname);

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
                  : "text-muted-foreground"
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
        <Input
          placeholder="Search..."
          className="pl-8"
        />
      </div>

      {/* Notification bell */}
      <Button variant="ghost" size="icon" className="relative">
        <Bell className="size-4" />
        <Badge className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full p-0 text-[0.6rem]">
          3
        </Badge>
      </Button>

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
            onClick={() => signOut({ callbackUrl: "/auth/login" })}
          >
            <LogOut className="size-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
