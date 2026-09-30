import { CategoryIcon } from "@/components/common/category-icon";
import type { Split } from "@/hooks/use-splits";
import { money, shortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useSplitSheet } from "@/stores/split-sheet-store";

/**
 * One shared bill. `effect` overrides the amount shown on the right
 * (e.g. on a person's page: what that person owes for this bill).
 */
export function SplitRow({ split, effect }: { split: Split; effect?: number }) {
  const openEdit = useSplitSheet((s) => s.openEdit);
  const value = effect ?? split.myEffect;
  const icon = split.category ??
    split.group ?? { icon: "users", color: "#64748b" };
  return (
    <button
      type="button"
      onClick={() => openEdit(split.id)}
      className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-muted md:hover:bg-muted/60"
    >
      <CategoryIcon icon={icon.icon} color={icon.color} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{split.description}</p>
        <p className="truncate text-xs text-muted-foreground">
          {[
            shortDate(split.date),
            split.group?.name,
            `${split.paidBy ? split.paidBy.name.split(" ")[0] : "You"} paid ${money(split.total)}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[11px] text-muted-foreground">
          {Math.abs(value) < 0.005
            ? "not involved"
            : value > 0
              ? "you lent"
              : "you borrowed"}
        </p>
        {Math.abs(value) >= 0.005 && (
          <p
            className={cn(
              "tabular text-sm font-semibold",
              value > 0 ? "text-income" : "text-expense",
            )}
          >
            {money(Math.abs(value))}
          </p>
        )}
      </div>
    </button>
  );
}
