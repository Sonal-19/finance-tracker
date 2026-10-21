import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  ArrowLeftRight,
  Keyboard,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  PieChart,
  Plus,
} from "lucide-react";
import * as React from "react";
import { Logo } from "@/components/common/logo";
import { SplitSheet } from "@/components/split/split-sheet";
import { TransactionSheet } from "@/components/transactions/transaction-sheet";
import { Button } from "@/components/ui/button";
import { usePublicConfig } from "@/hooks/use-passkeys";
import { useGlobalShortcuts, useShortcutMap } from "@/hooks/use-shortcuts";
import { syncNow } from "@/lib/offline/sync";
import { cn } from "@/lib/utils";
import type { AppUser } from "@/stores/auth-store";
import { useSplitSheet } from "@/stores/split-sheet-store";
import { useTxnSheet } from "@/stores/txn-sheet-store";
import { useUiStore } from "@/stores/ui-store";
import { BookSwitcher } from "./book-switcher";
import { InstallButton } from "./install-app";
import { navFor } from "./nav-items";
import { ShortcutKeys, ShortcutsDialog } from "./shortcuts";
import { SyncStatus } from "./sync-status";
import { Avatar, UserMenu, useSignOut } from "./user-menu";

/** Every keyboard shortcut's effect. */
function useShortcutHandlers() {
  const navigate = useNavigate();
  const openNew = useTxnSheet((s) => s.openNew);
  const openSplit = useSplitSheet((s) => s.openNew);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const setShortcutsOpen = useUiStore((s) => s.setShortcutsOpen);
  const go = (to: string) => () => navigate({ to });
  useGlobalShortcuts(useShortcutMap(), {
    addExpense: () => openNew("debit"),
    addIncome: () => openNew("credit"),
    addSplit: () => openSplit(),
    goDashboard: go("/dashboard"),
    goTransactions: go("/transactions"),
    goReports: go("/reports"),
    goAccounts: go("/accounts"),
    goBooks: go("/books"),
    goEvents: go("/events"),
    goSplit: go("/split"),
    goBudgets: go("/budgets"),
    goGoals: go("/goals"),
    goRecurring: go("/recurring"),
    goCategories: go("/categories"),
    goSettings: go("/settings"),
    search: async () => {
      if (!location.pathname.startsWith("/transactions"))
        await navigate({ to: "/transactions" });
      requestAnimationFrame(() =>
        document
          .querySelector<HTMLInputElement>("[data-search-input]")
          ?.focus(),
      );
    },
    toggleSidebar,
    syncNow: () => void syncNow(),
    showShortcuts: () => setShortcutsOpen(true),
    submitForm: () => {
      // The form in the open sheet, else the one being typed in.
      const form =
        document.querySelector<HTMLFormElement>(
          '[role="dialog"][data-state="open"] form',
        ) ?? (document.activeElement as HTMLInputElement | null)?.form;
      form?.requestSubmit();
    },
  });
}

/** `?new=debit|credit` (the installed app's shortcuts) opens the add sheet. */
function useLaunchAction() {
  const openNew = useTxnSheet((s) => s.openNew);
  React.useEffect(() => {
    const url = new URL(window.location.href);
    const type = url.searchParams.get("new");
    if (type !== "debit" && type !== "credit") return;
    openNew(type);
    url.searchParams.delete("new");
    history.replaceState(history.state, "", url);
  }, [openNew]);
}

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
  "/books",
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
  const notice = usePublicConfig().data?.notice;
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const setShortcutsOpen = useUiStore((s) => s.setShortcutsOpen);
  const keys = useShortcutMap();
  useShortcutHandlers();
  useLaunchAction();

  return (
    <div
      className={cn(
        "min-h-dvh md:grid md:transition-[grid-template-columns] md:duration-200",
        collapsed
          ? "md:grid-cols-[68px_1fr]"
          : "md:grid-cols-[220px_1fr] lg:grid-cols-[250px_1fr]",
      )}
    >
      {/* Desktop / tablet sidebar */}
      <aside
        className="sticky top-0 hidden h-dvh flex-col overflow-hidden border-r bg-card md:flex"
        data-collapsed={collapsed || undefined}
      >
        <div
          className={cn(
            "flex items-center gap-2 py-5",
            collapsed ? "flex-col px-2" : "justify-between px-5",
          )}
        >
          <Link to="/dashboard" aria-label="Dashboard">
            {collapsed ? (
              <img src="/favicon.svg" alt="" className="size-8 rounded-lg" />
            ) : (
              <Logo />
            )}
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground"
            onClick={toggleSidebar}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={`${collapsed ? "Expand" : "Collapse"} sidebar${keys.toggleSidebar ? ` (${keys.toggleSidebar})` : ""}`}
          >
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          </Button>
        </div>
        <div className={collapsed ? "px-2" : "px-3"}>
          <Button
            className="w-full"
            size={collapsed ? "icon" : "default"}
            onClick={() => openNew()}
            aria-label="Add transaction"
            title={`Add transaction${keys.addExpense ? ` (${keys.addExpense})` : ""}`}
          >
            <Plus />
            {!collapsed && (
              <>
                <span className="flex-1 text-left">Add transaction</span>
                {keys.addExpense && (
                  <ShortcutKeys
                    binding={keys.addExpense}
                    className="opacity-80 [&_kbd]:border-primary-foreground/30 [&_kbd]:bg-primary-foreground/15 [&_kbd]:text-primary-foreground"
                  />
                )}
              </>
            )}
          </Button>
        </div>
        <nav
          className={cn(
            "mt-4 flex-1 space-y-0.5 overflow-y-auto",
            collapsed ? "px-2" : "px-3",
          )}
        >
          {nav.map((n) => {
            const active = pathname.startsWith(n.to);
            return (
              <Link
                key={n.to}
                to={n.to}
                title={collapsed ? n.label : undefined}
                aria-label={collapsed ? n.label : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-lg py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                  collapsed ? "justify-center px-0" : "px-3",
                  active && "bg-accent text-accent-foreground hover:bg-accent",
                )}
              >
                <n.icon className="size-4.5 shrink-0" />
                {!collapsed && n.label}
              </Link>
            );
          })}
        </nav>
        <div
          className={cn(
            "space-y-1 border-t",
            collapsed ? "flex flex-col items-center p-2" : "p-3",
          )}
        >
          <SyncStatus compact={collapsed} />
          <div className={cn("flex gap-1", collapsed ? "flex-col" : "pt-1")}>
            <InstallButton
              compact={collapsed}
              className={collapsed ? "" : "flex-1"}
            />
            <Button
              variant="ghost"
              size="icon"
              className="size-9 shrink-0 text-muted-foreground"
              onClick={() => setShortcutsOpen(true)}
              aria-label="Keyboard shortcuts"
              title={`Keyboard shortcuts${keys.showShortcuts ? ` (${keys.showShortcuts})` : ""}`}
            >
              <Keyboard />
            </Button>
          </div>
        </div>
        <div
          className={cn(
            "flex items-center gap-3 border-t",
            collapsed ? "flex-col p-2" : "p-4",
          )}
        >
          <Avatar name={user.name} />
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{user.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {user.email}
              </p>
            </div>
          )}
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
          <div className="flex h-14 items-center justify-between gap-3 px-4 md:h-16 md:px-6 lg:px-8">
            <div className="flex min-w-0 flex-1 items-center gap-2 md:hidden">
              <img
                src="/favicon.svg"
                alt=""
                className="size-7 shrink-0 rounded-md"
              />
              <span className="min-w-0 leading-tight">
                <span className="block truncate font-semibold">
                  @{user.username}
                </span>
              </span>
            </div>
            <p className="hidden min-w-0 truncate text-sm text-muted-foreground md:block">
              Hello,{" "}
              <span className="font-medium text-foreground">
                @{user.username}
              </span>{" "}
              👋
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <div className="md:hidden">
                <SyncStatus compact />
              </div>
              <BookSwitcher />
              <UserMenu user={user} />
            </div>
          </div>
        </header>

        {notice && (
          <div
            role="status"
            className="flex items-start gap-2 border-b bg-accent px-4 py-2.5 text-sm text-accent-foreground md:px-6 lg:px-8"
          >
            <Megaphone className="mt-0.5 size-4 shrink-0" />
            <p className="min-w-0 whitespace-pre-line break-words">{notice}</p>
          </div>
        )}

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-4 pb-28 md:px-6 md:pt-6 md:pb-10 lg:px-8">
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
      <ShortcutsDialog />
    </div>
  );
}
