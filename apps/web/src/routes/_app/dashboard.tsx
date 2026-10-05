import { createFileRoute, Link } from "@tanstack/react-router";
import { format } from "date-fns";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  PiggyBank,
  Plus,
  Users,
  Wallet,
} from "lucide-react";
import { SectionCard } from "@/components/app/section-card";
import { StatCard } from "@/components/app/stat-card";
import { CategoryDonut } from "@/components/charts/category-donut";
import { IncomeExpenseChart } from "@/components/charts/income-expense-chart";
import { CategoryIcon } from "@/components/common/category-icon";
import { Progress } from "@/components/common/progress";
import { EmptyState, PageLoader } from "@/components/common/states";
import { TransactionRow } from "@/components/transactions/transaction-list";
import { Button } from "@/components/ui/button";
import { useActiveAccounts, useActiveEvent } from "@/hooks/use-accounts";
import { useAuth } from "@/hooks/use-auth";
import {
  useBalance,
  useBudgets,
  useGoals,
  useRecurring,
  useSummary,
  useTransactions,
} from "@/hooks/use-finance";
import { useBookScope } from "@/hooks/use-books";
import { useSplitSummary } from "@/hooks/use-splits";
import { money, pct, shortDate, todayStr } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useTxnSheet } from "@/stores/txn-sheet-store";

export const Route = createFileRoute("/_app/dashboard")({
  component: Dashboard,
});

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function Dashboard() {
  const { user } = useAuth();
  const today = todayStr();
  const { bookId } = useBookScope();
  const month = useSummary({ period: "month", date: today, bookId });
  const todaySummary = useSummary({ period: "day", date: today, bookId });
  const balance = useBalance();
  const budgets = useBudgets(undefined, bookId);
  const recent = useTransactions({ bookId });
  const recurring = useRecurring();
  const goals = useGoals();
  const splitSummary = useSplitSummary();
  const accounts = useActiveAccounts();
  const activeEvent = useActiveEvent();
  const openNew = useTxnSheet((s) => s.openNew);

  if (month.isLoading) return <PageLoader />;
  const m = month.data;
  const b = budgets.data;
  const overall = b?.overall;
  const alerts = [
    ...(overall?.budget
      ? [
          {
            name: "Overall monthly budget",
            spent: overall.spent,
            budget: overall.budget,
          },
        ]
      : []),
    ...(b?.categories ?? []).map((c) => ({
      name: c.category.name,
      spent: c.spent,
      budget: c.amount,
    })),
  ]
    .filter((a) => a.spent / a.budget >= 0.8)
    .sort((x, y) => y.spent / y.budget - x.spent / x.budget);
  const recentItems = recent.data?.pages[0]?.items.slice(0, 6) ?? [];
  const upcoming = (recurring.data ?? [])
    .filter((r) => r.status === "active")
    .slice(0, 4);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{greeting()},</p>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
            {user?.name.split(" ")[0]}
          </h1>
        </div>
        <div className="hidden gap-2 md:flex">
          <Button variant="outline" onClick={() => openNew("credit")}>
            <ArrowDownLeft className="text-income" /> Add income
          </Button>
          <Button onClick={() => openNew("debit")}>
            <Plus /> Add expense
          </Button>
        </div>
      </div>

      {/* Hero balance card */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-teal-600 to-teal-800 p-5 text-white shadow-lg shadow-teal-900/20 sm:p-6 dark:from-teal-700 dark:to-teal-950">
        <div className="absolute -top-10 -right-10 size-40 rounded-full bg-white/10" />
        <div className="absolute -right-4 -bottom-16 size-40 rounded-full bg-white/5" />
        <Link to="/accounts" className="relative block">
          <p className="text-sm text-white/80">
            Total balance
            {accounts.list.length > 0 &&
              ` · ${accounts.list.length} payment method${accounts.list.length > 1 ? "s" : ""}`}{" "}
            →
          </p>
          <p className="tabular mt-1 text-3xl font-bold sm:text-4xl">
            {money(balance.data?.balance ?? 0)}
          </p>
        </Link>
        <div className="mt-5 grid grid-cols-3 gap-3 text-sm">
          <div>
            <p className="flex items-center gap-1 text-white/75">
              <ArrowDownLeft className="size-3.5" /> Income
            </p>
            <p className="tabular font-semibold">
              {money(m?.current.income ?? 0)}
            </p>
          </div>
          <div>
            <p className="flex items-center gap-1 text-white/75">
              <ArrowUpRight className="size-3.5" /> Spent
            </p>
            <p className="tabular font-semibold">
              {money(m?.current.expense ?? 0)}
            </p>
          </div>
          <div>
            <p className="text-white/75">Saved</p>
            <p className="tabular font-semibold">{pct(m?.savingsRate)}</p>
          </div>
        </div>
        <p className="mt-3 text-xs text-white/70">
          {format(new Date(), "MMMM yyyy")} · Today spent{" "}
          {money(todaySummary.data?.current.expense ?? 0)}
        </p>
      </div>

      {/* Accounts at a glance */}
      {accounts.list.length > 1 && (
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
          {accounts.list.map((a) => (
            <Link
              key={a.id}
              to="/accounts/$accountId"
              params={{ accountId: String(a.id) }}
              className="flex min-w-40 shrink-0 items-center gap-2.5 rounded-2xl border bg-card p-3 active:bg-muted"
            >
              <CategoryIcon icon={a.icon} color={a.color} size="sm" />
              <span className="min-w-0">
                <span className="block truncate text-xs text-muted-foreground">
                  {a.name}
                </span>
                <span
                  className={cn(
                    "tabular block text-sm font-semibold",
                    a.balance < 0 && "text-expense",
                  )}
                >
                  {money(a.balance)}
                </span>
              </span>
            </Link>
          ))}
        </div>
      )}

      {/* Live event: new transactions are auto-tagged */}
      {activeEvent && (
        <Link
          to="/events/$eventId"
          params={{ eventId: String(activeEvent.id) }}
          className="flex items-center gap-3 rounded-2xl border-2 p-3"
          style={{
            borderColor: `${activeEvent.color}66`,
            backgroundColor: `${activeEvent.color}14`,
          }}
        >
          <CategoryIcon icon={activeEvent.icon} color={activeEvent.color} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">
              {activeEvent.name} is live
            </p>
            <p className="truncate text-xs text-muted-foreground">
              New expenses are tagged to it · spent {money(activeEvent.spent)}
              {activeEvent.budget ? ` of ${money(activeEvent.budget)}` : ""}
            </p>
          </div>
          <span className="text-sm font-medium text-primary">Open →</span>
        </Link>
      )}

      {/* Budget alerts (most urgent first, capped so they don't bury the page) */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.slice(0, 2).map((a) => (
            <BudgetAlert key={a.name} {...a} />
          ))}
          {alerts.length > 2 && (
            <Link
              to="/budgets"
              className="block text-center text-sm font-medium text-primary"
            >
              +{alerts.length - 2} more budget warning
              {alerts.length > 3 ? "s" : ""} →
            </Link>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Income"
          value={m?.current.income ?? 0}
          previous={m?.previous.income}
          tone="income"
          icon={<ArrowDownLeft />}
        />
        <StatCard
          label="Expense"
          value={m?.current.expense ?? 0}
          previous={m?.previous.expense}
          tone="expense"
          icon={<ArrowUpRight />}
          goodWhenUp={false}
        />
        <StatCard
          label="Net savings"
          value={m?.current.net ?? 0}
          previous={m?.previous.net}
          icon={<PiggyBank />}
        />
        <StatCard
          label="Avg. daily spend"
          value={m?.avgDailyExpense ?? 0}
          icon={<Wallet />}
          goodWhenUp={false}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-5 lg:items-start">
        <SectionCard
          className="lg:col-span-3"
          title="This month"
          action={
            <Link to="/reports" className="text-sm font-medium text-primary">
              Reports →
            </Link>
          }
        >
          {m && <IncomeExpenseChart data={m} height={220} />}
        </SectionCard>
        <SectionCard className="lg:col-span-2" title="Where money went">
          <CategoryDonut rows={m?.expenseByCategory ?? []} compact />
        </SectionCard>
      </div>

      <div className="grid gap-5 lg:grid-cols-5 lg:items-start">
        <SectionCard
          className="overflow-hidden p-0 sm:p-0 lg:col-span-3"
          title={
            <span className="block px-4 pt-4 sm:px-5 sm:pt-5">
              Recent transactions
            </span>
          }
          action={
            <Link
              to="/transactions"
              className="px-4 pt-4 text-sm font-medium text-primary sm:px-5 sm:pt-5"
            >
              See all →
            </Link>
          }
        >
          {recentItems.length ? (
            <div className="-mt-1 divide-y">
              {recentItems.map((t) => (
                <TransactionRow key={t.id} t={t} showDate />
              ))}
            </div>
          ) : (
            <EmptyState className="m-4" title="No transactions yet">
              <Button className="mt-3" onClick={() => openNew()}>
                <Plus /> Add your first one
              </Button>
            </EmptyState>
          )}
        </SectionCard>

        <div className="space-y-5 lg:col-span-2">
          <Link
            to="/split"
            className="flex items-center gap-3 rounded-2xl border bg-card p-4 transition-shadow hover:shadow-md"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground">
              <Users className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Split & share</p>
              <p className="truncate text-xs text-muted-foreground">
                {splitSummary.data &&
                (splitSummary.data.owedToYou > 0 ||
                  splitSummary.data.youOwe > 0)
                  ? [
                      splitSummary.data.owedToYou > 0 &&
                        `You're owed ${money(splitSummary.data.owedToYou)}`,
                      splitSummary.data.youOwe > 0 &&
                        `you owe ${money(splitSummary.data.youOwe)}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  : "Share bills with friends & family"}
              </p>
            </div>
            <span className="text-sm font-medium text-primary">Open →</span>
          </Link>

          <SectionCard
            title="Budget"
            action={
              <Link to="/budgets" className="text-sm font-medium text-primary">
                Manage →
              </Link>
            }
          >
            {overall?.budget ? (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="tabular font-semibold">
                    {money(overall.spent)}
                  </span>
                  <span className="tabular text-muted-foreground">
                    of {money(overall.budget)}
                  </span>
                </div>
                <Progress
                  value={overall.spent}
                  max={overall.budget}
                  className="h-3"
                />
                <p className="text-xs text-muted-foreground">
                  {overall.spent <= overall.budget
                    ? `${money(overall.budget - overall.spent)} left this month`
                    : `${money(overall.spent - overall.budget)} over budget`}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No monthly budget set.{" "}
                <Link to="/budgets" className="text-primary">
                  Set one
                </Link>{" "}
                to get alerts.
              </p>
            )}
          </SectionCard>

          {upcoming.length > 0 && (
            <SectionCard
              title="Upcoming"
              action={
                <Link
                  to="/recurring"
                  className="text-sm font-medium text-primary"
                >
                  All →
                </Link>
              }
            >
              <ul className="space-y-3">
                {upcoming.map((r) => (
                  <li key={r.id} className="flex items-center gap-3">
                    <CategoryIcon
                      icon={r.category.icon}
                      color={r.category.color}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {r.note || r.category.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {shortDate(r.nextRunDate)}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "tabular text-sm font-semibold",
                        r.type === "credit" && "text-income",
                      )}
                    >
                      {r.type === "credit" ? "+" : "−"}
                      {money(r.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}

          {(goals.data?.length ?? 0) > 0 && (
            <SectionCard
              title="Savings goals"
              action={
                <Link to="/goals" className="text-sm font-medium text-primary">
                  All →
                </Link>
              }
            >
              <ul className="space-y-4">
                {goals.data!.slice(0, 3).map((g) => (
                  <li key={g.id} className="space-y-1.5">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">{g.name}</span>
                      <span className="tabular text-muted-foreground">
                        {pct((g.saved / g.target) * 100)}
                      </span>
                    </div>
                    <Progress value={g.saved} max={g.target} color={g.color} />
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}
        </div>
      </div>
    </div>
  );
}

function BudgetAlert({
  name,
  spent,
  budget,
}: {
  name: string;
  spent: number;
  budget: number;
}) {
  const over = spent > budget;
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-xl border p-3 text-sm",
        over
          ? "border-expense/30 bg-expense/8"
          : "border-warning/30 bg-warning/8",
      )}
    >
      <AlertTriangle
        className={cn(
          "mt-0.5 size-4 shrink-0",
          over ? "text-expense" : "text-warning",
        )}
      />
      <p>
        <b>{name}</b>:{" "}
        {over
          ? `over budget by ${money(spent - budget)} (${money(spent)} of ${money(budget)})`
          : `${Math.round((spent / budget) * 100)}% used — ${money(budget - spent)} left`}
      </p>
    </div>
  );
}
