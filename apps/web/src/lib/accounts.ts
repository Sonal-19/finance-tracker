import type { AccountType } from "@/hooks/use-accounts";

export const ACCOUNT_TYPES: {
  value: AccountType;
  label: string;
  icon: string;
  color: string;
}[] = [
  { value: "bank", label: "Bank account", icon: "landmark", color: "#2563eb" },
  { value: "cash", label: "Cash", icon: "banknote", color: "#16a34a" },
  {
    value: "credit_card",
    label: "Credit card",
    icon: "credit-card",
    color: "#7c3aed",
  },
  {
    value: "wallet",
    label: "Wallet / UPI app",
    icon: "wallet",
    color: "#0ea5e9",
  },
  { value: "other", label: "Other", icon: "piggy-bank", color: "#64748b" },
];

export const accountTypeLabel = (t: string) =>
  ACCOUNT_TYPES.find((x) => x.value === t)?.label ?? t;

export const EVENT_ICONS = [
  "party-popper",
  "flame",
  "gift",
  "cake",
  "heart",
  "music",
  "plane",
  "tent",
  "shopping-bag",
  "utensils",
  "graduation-cap",
  "home",
];

/** "12 Oct – 14 Oct 2026" / "from 12 Oct" / null */
export function dateRangeLabel(
  start: string | null,
  end: string | null,
  fmt: (d: string) => string,
) {
  if (start && end)
    return start === end ? fmt(start) : `${fmt(start)} – ${fmt(end)}`;
  if (start) return `from ${fmt(start)}`;
  if (end) return `until ${fmt(end)}`;
  return null;
}
