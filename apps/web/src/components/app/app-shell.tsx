import { Link, useRouterState } from "@tanstack/react-router";
import {
  ArrowLeftRight,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  PieChart,
  Plus,
} from "lucide-react";
import type * as React from "react";
import { Logo } from "@/components/common/logo";
import { SplitSheet } from "@/components/split/split-sheet";
import { TransactionSheet } from "@/components/transactions/transaction-sheet";
import { Button } from "@/components/ui/button";
import { usePublicConfig } from "@/hooks/use-passkeys";
import { cn } from "@/lib/utils";
import type { AppUser } from "@/stores/auth-store";
import { useTxnSheet } from "@/stores/txn-sheet-store";
import { navFor } from "./nav-items";
import { Avatar, UserMenu, useSignOut } from "./user-menu";

const TABS = [
  { to: "/dashboard", label: "Home", icon: LayoutDashboard },
  { to: "/transactions", label: "History", icon: ArrowLeftRight },
  null,
  { to: "/reports", label: "Reports", icon: PieChart },
  { to: "/more", label: "More", icon: Menu },
] as const;

const MORE_PATHS = [
  "/more",
  "/accounts",
  "/events",
  "/split",
  "/budgets",
  "/goals",
  "/recurring",
  "/categories",
  "/settings",
  "/system-config",
];

export function AppShell({
  user,
  children,
}: {
  user: AppUser;
  children: React.ReactNode;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const openNew = useTxnSheet((s) => s.openNew);
  const signOut = useSignOut();
  const nav = navFor(user);
  const current = nav.find((n) => pathname.startsWith(n.to));
  const notice = usePublicConfig().data?.notice;

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[250px_1fr]">
      {/* Desktop / tablet sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r bg-card md:flex">
        <div className="px-5 py-5">
          <Link to="/dashboard">
            <Logo />
          </Link>
        </div>
        <div className="px-3">
          <Button className="w-full" onClick={() => openNew()}>
            <Plus /> Add transaction
          </Button>
        </div>
        <nav className="mt-4 flex-1 space-y-0.5 overflow-y-auto px-3">
          {nav.map((n) => {
            const active = pathname.startsWith(n.to);
            return (
              <Link
                key={n.to}
                to={n.to}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                  active && "bg-accent text-accent-foreground hover:bg-accent",
                )}
              >
                <n.icon className="size-4.5" />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-3 border-t p-4">
          <Avatar name={user.name} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {user.email}
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
        {/* Top bar */}
        <header className="pt-safe sticky top-0 z-30 border-b bg-background/85 backdrop-blur-lg">
          <div className="flex h-14 items-center justify-between gap-3 px-4 md:h-16 md:px-8">
            <div className="flex items-center gap-2 md:hidden">
              <img src="/favicon.svg" alt="" className="size-7 rounded-md" />
              <span className="font-semibold">
                {current?.label ?? (pathname === "/more" ? "More" : "Finance")}
              </span>
            </div>
            <p className="hidden text-sm text-muted-foreground md:block">
              Hello,{" "}
              <span className="font-medium text-foreground">
                {user.name.split(" ")[0]}
              </span>{" "}
              👋
            </p>
            <UserMenu user={user} />
          </div>
        </header>

        {notice && (
          <div
            role="status"
            className="flex items-start gap-2 border-b bg-accent px-4 py-2.5 text-sm text-accent-foreground md:px-8"
          >
            <Megaphone className="mt-0.5 size-4 shrink-0" />
            <p className="min-w-0 whitespace-pre-line break-words">{notice}</p>
          </div>
        )}

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-4 pb-28 md:px-8 md:pt-6 md:pb-10">
          {children}
        </main>
      </div>

      {/* Phone bottom tab bar */}
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 backdrop-blur-lg md:hidden">
        <div className="grid h-16 grid-cols-5 items-center">
          {TABS.map((tab) => {
            if (!tab)
              return (
                <div key="fab" className="grid place-items-center">
                  <button
                    type="button"
                    onClick={() => openNew()}
                    aria-label="Add transaction"
                    className="-mt-7 grid size-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 ring-4 ring-background transition-transform active:scale-90"
                  >
                    <Plus className="size-7" />
                  </button>
                </div>
              );
            const active =
              tab.to === "/more"
                ? MORE_PATHS.some((p) => pathname.startsWith(p))
                : pathname.startsWith(tab.to);
            return (
              <Link
                key={tab.to}
                to={tab.to}
                className={cn(
                  "flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted-foreground transition-colors",
                  active && "text-primary",
                )}
              >
                <tab.icon
                  className={cn(
                    "size-5.5 transition-transform",
                    active && "scale-110",
                  )}
                />
                {tab.label}
              </Link>
            );
          })}
        </div>
      </nav>

      <TransactionSheet />
      <SplitSheet />
    </div>
  );
}
