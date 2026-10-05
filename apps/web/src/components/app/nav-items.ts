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

export const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { to: "/accounts", label: "Payment methods", icon: Landmark },
  { to: "/books", label: "Books", icon: BookOpen },
  { to: "/reports", label: "Reports", icon: PieChart },
  { to: "/events", label: "Events", icon: PartyPopper },
  { to: "/split", label: "Split & share", icon: Users },
  { to: "/budgets", label: "Budgets", icon: Wallet },
  { to: "/goals", label: "Savings goals", icon: Target },
  { to: "/recurring", label: "Recurring", icon: Repeat },
  { to: "/categories", label: "Categories", icon: Tags },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

/** Extra entries for `role = admin` (the API enforces it; this only hides
 * the link). */
export const ADMIN_NAV = [
  { to: "/system-config", label: "System config", icon: SlidersHorizontal },
] as const;

export const navFor = (user: { role?: string } | null | undefined) =>
  user?.role === "admin" ? [...NAV, ...ADMIN_NAV] : [...NAV];
