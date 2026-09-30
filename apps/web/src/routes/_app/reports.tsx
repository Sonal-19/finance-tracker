import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Gauge,
  PiggyBank,
  Receipt,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import { PeriodPicker, type PeriodState } from "@/components/app/period-picker";
import { SectionCard } from "@/components/app/section-card";
import { StatCard } from "@/components/app/stat-card";
import { CategoryDonut } from "@/components/charts/category-donut";
import {
  bucketLabel,
  IncomeExpenseChart,
} from "@/components/charts/income-expense-chart";
import { SpendCalendar } from "@/components/charts/spend-calendar";
import { SpendTrendChart } from "@/components/charts/spend-trend-chart";
import { PageHeader } from "@/components/common/page-header";
import { Segmented } from "@/components/common/segmented";
import { ErrorState, PageLoader } from "@/components/common/states";
import { useActiveAccounts } from "@/hooks/use-accounts";
import { useSummary } from "@/hooks/use-finance";
import { money, pct, todayStr } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/reports")({
  component: ReportsPage,
});

function ReportsPage() {
  const [p, setP] = useState<PeriodState>({
    period: "month",
    date: todayStr(),
  });
  const [catType, setCatType] = useState<"debit" | "credit">("debit");
  const [showTable, setShowTable] = useState(false);
  const [accountId, setAccountId] = useState<number | undefined>();
  const navigate = useNavigate();
  const { list: accounts } = useActiveAccounts();
  const { data, isLoading, error } = useSummary({ ...p, accountId });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reports"
        description="Your income and spending by day, week, month or year."
      />
      <PeriodPicker value={p} onChange={setP} />
      {accounts.length > 1 && (
        <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
          {[{ id: undefined, name: "All accounts" }, ...accounts].map((a) => (
            <button
              key={a.id ?? "all"}
              type="button"
              onClick={() => setAccountId(a.id)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-sm",
                accountId === a.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "hover:bg-muted",
              )}
            >
              {a.name}
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <PageLoader />
      ) : error ? (
        <ErrorState error={error} />
      ) : data ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <StatCard
              label="Income"
              value={data.current.income}
              previous={data.previous.income}
              tone="income"
              icon={<ArrowDownLeft />}
            />
            <StatCard
              label="Expense"
              value={data.current.expense}
              previous={data.previous.expense}
              tone="expense"
              icon={<ArrowUpRight />}
              goodWhenUp={false}
            />
            <StatCard
              label="Net savings"
              value={data.current.net}
              previous={data.previous.net}
              icon={<Wallet />}
            />
            <StatCard
              label="Savings rate"
              value={data.savingsRate ?? 0}
              display={pct(data.savingsRate, 1)}
              icon={<PiggyBank />}
            />
            <StatCard
              label="Avg. daily spend"
              value={data.avgDailyExpense}
              icon={<Gauge />}
            />
            <StatCard
              label="Transactions"
              value={data.current.count}
              display={String(data.current.count)}
              icon={<Receipt />}
            />
          </div>

          {p.period !== "day" && (
            <SectionCard
              title="Income vs expense"
              action={
                <button
                  type="button"
                  className="text-sm font-medium text-primary"
                  onClick={() => setShowTable((s) => !s)}
                >
                  {showTable ? "Show chart" : "Show table"}
                </button>
              }
            >
              {showTable ? (
                <div className="max-h-96 overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-card text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="py-2 font-medium">
                          {data.unit === "day" ? "Day" : "Month"}
                        </th>
                        <th className="py-2 text-right font-medium">Income</th>
                        <th className="py-2 text-right font-medium">Expense</th>
                        <th className="py-2 text-right font-medium">Net</th>
                      </tr>
                    </thead>
                    <tbody className="tabular divide-y">
                      {data.buckets.map((b) => (
                        <tr key={b.key}>
                          <td className="py-2">
                            {bucketLabel(b.key, data.unit, true)}
                          </td>
                          <td className="py-2 text-right text-income">
                            {money(b.income)}
                          </td>
                          <td className="py-2 text-right text-expense">
                            {money(b.expense)}
                          </td>
                          <td className="py-2 text-right font-medium">
                            {money(b.income - b.expense)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <IncomeExpenseChart data={data} />
              )}
            </SectionCard>
          )}

          <div className="grid gap-5 lg:grid-cols-2">
            <SectionCard
              title="By category"
              action={
                <Segmented
                  size="sm"
                  value={catType}
                  onChange={setCatType}
                  options={[
                    { value: "debit", label: "Expense" },
                    { value: "credit", label: "Income" },
                  ]}
                />
              }
            >
              <CategoryDonut
                rows={
                  catType === "debit"
                    ? data.expenseByCategory
                    : data.incomeByCategory
                }
                label={catType === "debit" ? "Spent" : "Received"}
              />
            </SectionCard>
            <div className="space-y-5">
              {p.period !== "day" && (
                <SectionCard title="Spending trend (cumulative)">
                  <SpendTrendChart data={data} />
                </SectionCard>
              )}
              <SectionCard title="Spending calendar">
                <SpendCalendar
                  accountId={accountId}
                  onDayClick={(d) =>
                    navigate({
                      to: "/transactions",
                      search: { from: d, to: d, accountId },
                    })
                  }
                />
              </SectionCard>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
