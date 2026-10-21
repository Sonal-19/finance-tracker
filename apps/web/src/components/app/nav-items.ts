import {
  ArrowLeftRight,
  BookOpen,
  Landmark,
  LayoutDashboard,
  PartyPopper,
  PieChart,
  Repeat,
  Settings,
  SlidersHorizontal,
  Tags,
  Target,
  Users,
  Wallet,
} from "lucide-react";
import type { ShortcutAction } from "$/lib/utils/shortcuts";

/** `shortcut` is the "Go to" action shown beside the item on desktop. */
export const NAV = [
  {
    to: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    shortcut: "goDashboard",
  },
  {
    to: "/transactions",
    label: "Transactions",
    icon: ArrowLeftRight,
    shortcut: "goTransactions",
  },
  {
    to: "/accounts",
    label: "Payment methods",
    icon: Landmark,
    shortcut: "goAccounts",
  },
  { to: "/books", label: "Books", icon: BookOpen, shortcut: "goBooks" },
  { to: "/reports", label: "Reports", icon: PieChart, shortcut: "goReports" },
  { to: "/events", label: "Events", icon: PartyPopper, shortcut: "goEvents" },
  { to: "/split", label: "Split & share", icon: Users, shortcut: "goSplit" },
  { to: "/budgets", label: "Budgets", icon: Wallet, shortcut: "goBudgets" },
  { to: "/goals", label: "Savings goals", icon: Target, shortcut: "goGoals" },
  {
    to: "/recurring",
    label: "Recurring",
    icon: Repeat,
    shortcut: "goRecurring",
  },
  {
    to: "/categories",
    label: "Categories",
    icon: Tags,
    shortcut: "goCategories",
  },
  {
    to: "/settings",
    label: "Settings",
    icon: Settings,
    shortcut: "goSettings",
  },
] as const;

/** Extra entries for `role = admin` (the API enforces it; this only hides
 * the link). */
export const ADMIN_NAV = [
  { to: "/system-config", label: "System config", icon: SlidersHorizontal },
] as const;

export type NavItem = {
  to: (typeof NAV | typeof ADMIN_NAV)[number]["to"];
  label: string;
  icon: (typeof NAV)[number]["icon"];
  shortcut?: ShortcutAction;
};

export const navFor = (
  user: { role?: string } | null | undefined,
): NavItem[] => (user?.role === "admin" ? [...NAV, ...ADMIN_NAV] : [...NAV]);
