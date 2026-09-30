import type { DB, TX } from "$/db";
import {
  categoriesTable,
  type InsertCategory,
  type TxnType,
} from "$/db/schema";

type Def = { name: string; icon: string; color: string };

export const DEFAULT_CATEGORIES: Record<TxnType, Def[]> = {
  credit: [
    { name: "Salary", icon: "briefcase", color: "#16a34a" },
    { name: "Freelance", icon: "laptop", color: "#0d9488" },
    { name: "Business", icon: "store", color: "#0891b2" },
    { name: "Interest", icon: "percent", color: "#2563eb" },
    { name: "Investment returns", icon: "trending-up", color: "#7c3aed" },
    { name: "Gift", icon: "gift", color: "#db2777" },
    { name: "Refund", icon: "rotate-ccw", color: "#ea580c" },
    { name: "Other income", icon: "plus-circle", color: "#64748b" },
  ],
  debit: [
    { name: "Room rent", icon: "home", color: "#dc2626" },
    { name: "Grocery", icon: "shopping-basket", color: "#16a34a" },
    { name: "Food & dining", icon: "utensils", color: "#f97316" },
    { name: "Medical", icon: "heart-pulse", color: "#e11d48" },
    { name: "Travel", icon: "plane", color: "#0ea5e9" },
    { name: "Shopping", icon: "shopping-bag", color: "#a855f7" },
    { name: "Bills & utilities", icon: "receipt", color: "#eab308" },
    { name: "Fuel", icon: "fuel", color: "#78716c" },
    { name: "Education", icon: "graduation-cap", color: "#4f46e5" },
    { name: "Entertainment", icon: "clapperboard", color: "#ec4899" },
    { name: "EMI / Loan", icon: "landmark", color: "#b91c1c" },
    { name: "Insurance", icon: "shield", color: "#0f766e" },
    { name: "Personal care", icon: "sparkles", color: "#d946ef" },
    { name: "Other expense", icon: "circle-ellipsis", color: "#64748b" },
  ],
};

export function defaultCategoryRows(userId: number): InsertCategory[] {
  return (["credit", "debit"] as const).flatMap((type) =>
    DEFAULT_CATEGORIES[type].map((c) => ({
      ...c,
      type,
      userId,
      isDefault: true,
    })),
  );
}

export async function seedDefaultCategories(tx: DB | TX, userId: number) {
  return tx
    .insert(categoriesTable)
    .values(defaultCategoryRows(userId))
    .returning();
}
