import { createFileRoute } from "@tanstack/react-router";
import { addMonths, format, parseISO } from "date-fns";
import { ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { SectionCard } from "@/components/app/section-card";
import { CategoryIcon } from "@/components/common/category-icon";
import { CollapsibleGrid } from "@/components/common/collapsible-grid";
import { confirm } from "@/components/common/confirm-dialog";
import { Field } from "@/components/common/field";
import { PageHeader } from "@/components/common/page-header";
import { Progress } from "@/components/common/progress";
import { ResponsiveSheet } from "@/components/common/responsive-sheet";
import { EmptyState, PageLoader } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { useBookScope } from "@/hooks/use-books";
import {
  useBudgets,
  useCategories,
  useDeleteBudget,
  useSaveBudget,
  useUpdateProfile,
} from "@/hooks/use-finance";
import { formatAmount, fromAmount, toAmount } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/budgets")({
  component: BudgetsPage,
});

function BudgetsPage() {
  const [month, setMonth] = useState(() => format(new Date(), "yyyy-MM"));
  const { bookId } = useBookScope();
  const { data, isLoading } = useBudgets(month, bookId);
  const { user } = useAuth();
  const del = useDeleteBudget();
  const [editing, setEditing] = useState<{
    categoryId?: number;
    amount?: number;
  } | null>(null);
  const [overallOpen, setOverallOpen] = useState(false);
  const first = parseISO(`${month}-01`);

  const overall = data?.overall;
  return (
    <div className="space-y-5">
      <PageHeader
        title="Budgets"
        description="Monthly spending limits. We warn you at 80% and 100%."
        actions={
          <Button onClick={() => setEditing({})}>
            <Plus /> Category budget
          </Button>
        }
      />
      <div className="flex items-center justify-between rounded-xl border bg-card p-1 sm:inline-flex">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Previous month"
          onClick={() => setMonth(format(addMonths(first, -1), "yyyy-MM"))}
        >
          <ChevronLeft />
        </Button>
        <span className="min-w-36 text-center text-sm font-semibold">
          {format(first, "MMMM yyyy")}
        </span>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Next month"
          onClick={() => setMonth(format(addMonths(first, 1), "yyyy-MM"))}
        >
          <ChevronRight />
        </Button>
      </div>

      {isLoading || !data ? (
        <PageLoader />
      ) : (
        <>
          <SectionCard
            title="Overall monthly budget"
            action={
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setOverallOpen(true)}
              >
                <Pencil /> {overall?.budget ? "Edit" : "Set"}
              </Button>
            }
          >
            {overall?.budget ? (
              <BudgetBar spent={overall.spent} budget={overall.budget} large />
            ) : (
              <p className="text-sm text-muted-foreground">
                You've spent{" "}
                <b className="text-foreground">
                  {formatAmount(overall?.spent ?? 0)}
                </b>{" "}
                this month. Set an overall limit to track it.
              </p>
            )}
          </SectionCard>

          {data.categories.length === 0 ? (
            <EmptyState title="No category budgets yet">
              Add limits for categories like Food, Shopping or Travel.
            </EmptyState>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {data.categories
                .slice()
                .sort((a, b) => b.spent / b.amount - a.spent / a.amount)
                .map((b) => (
                  <div key={b.id} className="rounded-2xl border bg-card p-4">
                    <div className="mb-3 flex items-center gap-3">
                      <CategoryIcon
                        icon={b.category.icon}
                        color={b.category.color}
                      />
                      <p className="flex-1 font-medium">{b.category.name}</p>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Edit budget"
                        onClick={() =>
                          setEditing({
                            categoryId: b.category.id,
                            amount: b.amount,
                          })
                        }
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Remove budget"
                        onClick={async () => {
                          if (
                            await confirm({
                              title: `Remove ${b.category.name} budget?`,
                              confirmText: "Remove",
                              destructive: true,
                            })
                          )
                            del.mutate(b.id);
                        }}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                    <BudgetBar spent={b.spent} budget={b.amount} />
                  </div>
                ))}
            </div>
          )}
        </>
      )}

      <CategoryBudgetSheet
        value={editing}
        onClose={() => setEditing(null)}
        taken={data?.categories.map((c) => c.category.id) ?? []}
      />
      <OverallBudgetSheet
        open={overallOpen}
        onOpenChange={setOverallOpen}
        current={user?.monthlyBudget ?? null}
      />
    </div>
  );
}

function BudgetBar({
  spent,
  budget,
  large,
}: {
  spent: number;
  budget: number;
  large?: boolean;
}) {
  const ratio = spent / budget;
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between text-sm">
        <span className={cn("tabular font-semibold", large && "text-xl")}>
          {formatAmount(spent)}
        </span>
        <span className="tabular text-muted-foreground">
          of {formatAmount(budget)}
        </span>
      </div>
      <Progress
        value={spent}
        max={budget}
        className={large ? "h-3" : undefined}
      />
      <p
        className={cn(
          "text-xs",
          ratio > 1
            ? "text-expense"
            : ratio >= 0.8
              ? "text-warning"
              : "text-muted-foreground",
        )}
      >
        {ratio > 1
          ? `Over by ${formatAmount(spent - budget)}`
          : `${formatAmount(budget - spent)} left · ${Math.round(ratio * 100)}% used`}
      </p>
    </div>
  );
}

function CategoryBudgetSheet({
  value,
  onClose,
  taken,
}: {
  value: { categoryId?: number; amount?: number } | null;
  onClose: () => void;
  taken: number[];
}) {
  const { data: categories = [] } = useCategories();
  const save = useSaveBudget();
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setCategoryId(value?.categoryId ?? null);
    setAmount(value?.amount ? String(fromAmount(value.amount)) : "");
  }
  const editingExisting = !!value?.categoryId;
  const options = categories.filter(
    (c) =>
      c.type === "debit" &&
      (editingExisting ? c.id === value?.categoryId : !taken.includes(c.id)),
  );

  return (
    <ResponsiveSheet
      open={!!value}
      onOpenChange={(o) => !o && onClose()}
      title={editingExisting ? "Edit budget" : "New category budget"}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!categoryId || !(Number(amount) > 0)) return;
          save.mutate(
            { categoryId, amount: toAmount(Number(amount)) },
            { onSuccess: onClose },
          );
        }}
      >
        <CollapsibleGrid
          variant="tile"
          selectedIndex={options.findIndex((c) => c.id === categoryId)}
          className="grid-cols-4 gap-2 sm:grid-cols-5"
        >
          {options.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategoryId(c.id)}
              className={cn(
                "flex flex-col items-center gap-1 rounded-xl border border-transparent p-2 text-center",
                categoryId === c.id
                  ? "border-ring bg-accent"
                  : "hover:bg-muted",
              )}
            >
              <CategoryIcon icon={c.icon} color={c.color} size="sm" />
              <span className="line-clamp-2 text-[11px] leading-tight">
                {c.name}
              </span>
            </button>
          ))}
        </CollapsibleGrid>
        <Field label="Monthly limit (₹)" htmlFor="budget-amount">
          <Input
            id="budget-amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
            placeholder="5000"
          />
        </Field>
        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={!categoryId || !(Number(amount) > 0) || save.isPending}
        >
          Save budget
        </Button>
      </form>
    </ResponsiveSheet>
  );
}

function OverallBudgetSheet({
  open,
  onOpenChange,
  current,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  current: number | null;
}) {
  const update = useUpdateProfile();
  const [amount, setAmount] = useState("");
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setAmount(current ? String(fromAmount(current)) : "");
  }
  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Overall monthly budget"
      description="The total you plan to spend each month across all categories."
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          update.mutate(
            { monthlyBudget: amount ? toAmount(Number(amount)) : null },
            { onSuccess: () => onOpenChange(false) },
          );
        }}
      >
        <Field
          label="Amount (₹)"
          htmlFor="overall-amount"
          hint="Leave empty to remove."
        >
          <Input
            id="overall-amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
            placeholder="40000"
          />
        </Field>
        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={update.isPending}
        >
          Save
        </Button>
      </form>
    </ResponsiveSheet>
  );
}
