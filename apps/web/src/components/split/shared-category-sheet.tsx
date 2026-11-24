import { useEffect, useState } from "react";
import { CategoryIcon } from "@/components/common/category-icon";
import { ResponsiveSheet } from "@/components/common/responsive-sheet";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useCategories } from "@/hooks/use-finance";
import { type SharedSplit, useSetSharedAdded } from "@/hooks/use-splits";
import { formatAmount } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Where a split someone tagged me on goes in my own books. Opened when
 * none of my categories matched theirs, or when I tap the category chip.
 * "Always" saves a rule so their next splits from that category go there
 * too (and moves copies still sitting in "Shared expenses").
 */
export function SharedCategorySheet({
  split,
  onClose,
}: {
  split: SharedSplit | null;
  onClose: () => void;
}) {
  const { data: categories = [] } = useCategories();
  const save = useSetSharedAdded();
  const debit = categories.filter((c) => c.type === "debit");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [always, setAlways] = useState(true);

  useEffect(() => {
    if (!split) return;
    setCategoryId(
      split.categoryMatch === "unmatched"
        ? null
        : (split.suggestedCategoryId ?? split.category?.id ?? null),
    );
    setAlways(true);
  }, [split]);

  const owner = split?.ownerName.split(" ")[0] ?? "";
  const source = split?.sourceCategory;

  return (
    <ResponsiveSheet
      open={!!split}
      onOpenChange={(o) => !o && onClose()}
      title="Which category is this?"
      description={
        split
          ? `Your share of “${split.description}” (${formatAmount(split.myShare)}) is added to your expenses here.`
          : undefined
      }
    >
      {split && (
        <div className="space-y-4">
          {source && (
            <p className="flex items-center gap-2 rounded-xl bg-muted/60 px-3 py-2 text-sm">
              <CategoryIcon icon={source.icon} color={source.color} size="sm" />
              <span>
                {owner} filed it under <b>{source.name}</b>
                {split.categoryMatch === "unmatched" &&
                  ", which you don't have"}
              </span>
            </p>
          )}
          <div className="grid max-h-[45dvh] grid-cols-4 gap-1 overflow-y-auto sm:grid-cols-5">
            {debit.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={categoryId === c.id}
                onClick={() => setCategoryId(c.id)}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-xl border border-transparent p-1.5 text-center",
                  categoryId === c.id
                    ? "border-ring bg-accent"
                    : "hover:bg-muted",
                )}
              >
                <CategoryIcon icon={c.icon} color={c.color} size="sm" />
                <span className="line-clamp-2 text-[10px] leading-tight">
                  {c.name}
                </span>
              </button>
            ))}
          </div>
          {source && (
            <label className="flex items-center justify-between gap-3 rounded-xl border p-3 text-sm">
              <span>
                <span className="block font-medium">
                  Always use this for {owner}'s {source.name}
                </span>
                <span className="block text-xs text-muted-foreground">
                  Their next splits go here without asking.
                </span>
              </span>
              <Switch checked={always} onCheckedChange={setAlways} />
            </label>
          )}
          <Button
            size="lg"
            className="w-full"
            disabled={!categoryId || save.isPending}
            onClick={() =>
              categoryId &&
              save.mutate(
                {
                  id: split.id,
                  decision: "added",
                  categoryId,
                  remember: source && always ? "always" : "split",
                },
                { onSuccess: onClose },
              )
            }
          >
            {save.isPending ? "Saving…" : "Add to my expenses"}
          </Button>
        </div>
      )}
    </ResponsiveSheet>
  );
}
