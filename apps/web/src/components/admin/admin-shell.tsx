import { Link, useRouterState } from "@tanstack/react-router";
import {
  Crown,
  History,
  LayoutDashboard,
  LogOut,
  MonitorSmartphone,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  Wallet,
} from "lucide-react";
import type * as React from "react";
import { Avatar, UserMenu, useSignOut } from "@/components/app/user-menu";
import { Logo } from "@/components/common/logo";
import { Button } from "@/components/ui/button";
import { type AdminPermission, useAdminCan } from "@/hooks/use-admin";
import { cn } from "@/lib/utils";
import type { AppUser } from "@/stores/auth-store";

/** `needs`: the permission that opens the page (the overview needs none). */
const ADMIN_AREA_NAV: {
  to:
    | "/admin"
    | "/admin/users"
    | "/admin/sessions"
    | "/admin/activity"
    | "/system-config";
  label: string;
  short: string;
  icon: typeof Users;
  needs?: AdminPermission;
}[] = [
  { to: "/admin", label: "Overview", short: "Overview", icon: LayoutDashboard },
  {
    to: "/admin/users",
    label: "Users",
    short: "Users",
    icon: Users,
    needs: "users.view",
  },
  {
    to: "/admin/sessions",
    label: "Sessions & devices",
    short: "Sessions",
    icon: MonitorSmartphone,
    needs: "sessions.view",
  },
  {
    to: "/admin/activity",
    label: "Activity log",
    short: "Activity",
    icon: History,
    needs: "activity.view",
  },
  {
    to: "/system-config",
    label: "System config",
    short: "Config",
    icon: SlidersHorizontal,
    needs: "system_config.edit",
  },
];

/** `/admin` is active only on itself; the others on their sub-pages too. */
const isActive = (pathname: string, to: string) =>
  to === "/admin"
    ? pathname === "/admin" || pathname === "/admin/"
    : pathname.startsWith(to);

export function AdminShell({
  user,
  children,
}: {
  user: AppUser;
  children: React.ReactNode;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const signOut = useSignOut();
  const { master, can } = useAdminCan();
  const nav = ADMIN_AREA_NAV.filter((n) => !n.needs || can(n.needs));

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[220px_1fr] lg:grid-cols-[248px_1fr]">
      {/* Desktop / tablet sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r bg-card md:flex">
        <Link to="/admin" className="flex items-center gap-2 px-5 py-5">
          <Logo />
        </Link>
        {master ? (
          <p className="mx-5 mb-3 inline-flex w-fit items-center gap-1.5 rounded-full bg-warning/15 px-2.5 py-1 text-xs font-semibold text-warning">
            <Crown className="size-3.5" /> Master admin
          </p>
        ) : (
          <p className="mx-5 mb-3 inline-flex w-fit items-center gap-1.5 rounded-full bg-primary/12 px-2.5 py-1 text-xs font-semibold text-primary">
            <ShieldCheck className="size-3.5" /> Admin console
          </p>
        )}
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
          {nav.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                isActive(pathname, n.to) &&
                  "bg-accent text-accent-foreground hover:bg-accent",
              )}
            >
              <n.icon className="size-4.5 shrink-0" />
              <span className="truncate">{n.label}</span>
            </Link>
          ))}
        </nav>
        <div className="border-t p-3">
          <Button variant="outline" className="w-full justify-start" asChild>
            <Link to="/dashboard">
              <Wallet /> Open my finances
            </Link>
          </Button>
        </div>
        <div className="flex items-center gap-3 border-t p-4">
          <Avatar name={user.name} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              @{user.username}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={signOut}
            aria-label="Log out"
            title="Log out"
          >
            <LogOut />
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="pt-safe sticky top-0 z-30 border-b bg-background/85 backdrop-blur-lg">
          <div className="flex h-14 items-center justify-between gap-3 px-4 md:h-16 md:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-2 md:hidden">
              <Logo withText={false} iconClassName="size-7 rounded-md" />
              <span className="truncate font-semibold">Admin</span>
            </div>
            <p className="hidden min-w-0 truncate text-sm text-muted-foreground md:block">
              Signed in as{" "}
              <span className="font-medium text-foreground">
                @{user.username}
              </span>
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <Button variant="ghost" size="sm" className="md:hidden" asChild>
                <Link to="/dashboard">
                  <Wallet /> My finances
                </Link>
              </Button>
              <UserMenu user={user} />
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-4 pb-28 md:px-6 md:pt-6 md:pb-10 lg:px-8">
          {children}
        </main>
      </div>

      {/* Phone bottom tab bar */}
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 backdrop-blur-lg md:hidden">
        <div
          className="grid h-16 items-center"
          style={{ gridTemplateColumns: `repeat(${nav.length}, 1fr)` }}
        >
          {nav.map((n) => {
            const active = isActive(pathname, n.to);
            return (
              <Link
                key={n.to}
                to={n.to}
                className={cn(
                  "flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted-foreground transition-colors",
                  active && "text-primary",
                )}
              >
                <n.icon
                  className={cn(
                    "size-5.5 transition-transform",
                    active && "scale-110",
                  )}
                />
                {n.short}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
