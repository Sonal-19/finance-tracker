import {
  ArrowLeftRight,
  BellRing,
  BookOpen,
  Landmark,
  LayoutDashboard,
  PartyPopper,
  PieChart,
  Repeat,
  Settings,
  ShieldCheck,
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
  { to: "/reminders", label: "Reminders", icon: BellRing },
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

/** For `role = admin`: the way into the admin console, which has its own
 * shell (`routes/_admin.tsx`). The API enforces the role; this only hides
 * the link. */
const ADMIN_HOME = {
  to: "/admin",
  label: "Admin console",
  icon: ShieldCheck,
} as const;

type NavUser = { role?: string } | null | undefined;

/** Admins land on the admin dashboard; everyone else on their finances. */
export const homeFor = (user: NavUser) =>
  user?.role === "admin" ? ADMIN_HOME.to : "/dashboard";

export type NavItem = {
  to: (typeof NAV)[number]["to"] | typeof ADMIN_HOME.to;
  label: string;
  icon: (typeof NAV)[number]["icon"] | typeof ADMIN_HOME.icon;
  shortcut?: ShortcutAction;
};

export const navFor = (user: NavUser): NavItem[] =>
  user?.role === "admin" ? [...NAV, ADMIN_HOME] : [...NAV];
