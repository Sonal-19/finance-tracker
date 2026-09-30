import {
  ArrowLeftRight,
  Landmark,
  LayoutDashboard,
  PartyPopper,
  PieChart,
  Repeat,
  Settings,
  Tags,
  Target,
  Users,
  Wallet,
} from "lucide-react";

export const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { to: "/accounts", label: "Accounts", icon: Landmark },
  { to: "/reports", label: "Reports", icon: PieChart },
  { to: "/events", label: "Events", icon: PartyPopper },
  { to: "/split", label: "Split & share", icon: Users },
  { to: "/budgets", label: "Budgets", icon: Wallet },
  { to: "/goals", label: "Savings goals", icon: Target },
  { to: "/recurring", label: "Recurring", icon: Repeat },
  { to: "/categories", label: "Categories", icon: Tags },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;
