import { ChevronRight, Repeat, Users } from "lucide-react";
import { CategoryIcon } from "@/components/common/category-icon";
import { useActiveBooks } from "@/hooks/use-books";
import type { Txn } from "@/hooks/use-finance";
import {
  dayLabel,
  formatAmount,
  formatSignedAmount,
  fromAmount,
  ymd,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { useTxnSheet } from "@/stores/txn-sheet-store";

export function TransactionRow({
  t,
  showDate,
}: {
  t: Txn;
  showDate?: boolean;
}) {
  const openEdit = useTxnSheet((s) => s.openEdit);
  const defaultBookId = useActiveBooks().defaultBook?.id;
  return (
    <button
      type="button"
      onClick={() => openEdit(t)}
      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60 active:bg-muted"
    >
      <CategoryIcon icon={t.category.icon} color={t.category.color} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate font-medium">
          {t.category.name}
          {t.recurringId && (
            <Repeat
              className="size-3.5 text-muted-foreground"
              aria-label="Recurring"
            />
          )}
          {t.splitId && (
            <Users
              className="size-3.5 text-muted-foreground"
              aria-label="Your share of a split"
            />
          )}
          {!defaultBookId || t.book.id === defaultBookId ? null : (
            <span
              className="truncate rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
              style={{
                backgroundColor: `${t.book.color}1f`,
                color: t.book.color,
              }}
            >
              {t.book.name}
            </span>
          )}
          {t.event && (
            <span
              className="truncate rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
              style={{
                backgroundColor: `${t.event.color}1f`,
                color: t.event.color,
              }}
            >
              {t.event.name}
            </span>
          )}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {[
            showDate ? dayLabel(t.date) : null,
            t.originalCurrency === "USD" && t.originalAmount !== null
              ? `$${fromAmount(t.originalAmount).toFixed(2)} @ ₹${Number(t.fxRate).toFixed(2)}`
              : null,
            t.account.name,
            t.note,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      <span
        className={cn(
          "tabular shrink-0 font-semibold",
          t.type === "credit" ? "text-income" : "text-foreground",
        )}
      >
        {formatSignedAmount(t.amount, t.type)}
      </span>
      <ChevronRight className="hidden size-4 shrink-0 text-muted-foreground md:block" />
    </button>
  );
}

/** Transactions grouped under sticky day headers with that day's totals. */
export function GroupedTransactions({
  items,
  dayTotals,
}: {
  items: Txn[];
  dayTotals: Record<string, { income: number; expense: number }>;
}) {
  const groups: { date: string; items: Txn[] }[] = [];
  for (const t of items) {
    const d = ymd(t.date);
    const last = groups[groups.length - 1];
    if (last?.date === d) last.items.push(t);
    else groups.push({ date: d, items: [t] });
  }
  return (
    <div className="space-y-4">
      {groups.map((g) => {
        const tot = dayTotals[g.date];
        return (
          <section
            key={g.date}
            className="overflow-hidden rounded-2xl border bg-card"
          >
            <header className="flex items-center justify-between border-b bg-muted/40 px-4 py-2 text-xs">
              <span className="font-semibold">{dayLabel(g.date)}</span>
              {tot && (
                <span className="tabular flex gap-3 text-muted-foreground">
                  {tot.income > 0 && (
                    <span className="text-income">
                      +{formatAmount(tot.income)}
                    </span>
                  )}
                  {tot.expense > 0 && (
                    <span className="text-expense">
                      −{formatAmount(tot.expense)}
                    </span>
                  )}
                </span>
              )}
            </header>
            <div className="divide-y">
              {g.items.map((t) => (
                <TransactionRow key={t.id} t={t} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
