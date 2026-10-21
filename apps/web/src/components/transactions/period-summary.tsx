import {
  eachDayOfInterval,
  eachMonthOfInterval,
  format,
  parseISO,
} from "date-fns";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import {
  ChartTooltip,
  EXPENSE_COLOR,
  INCOME_COLOR,
} from "@/components/charts/chart-tooltip";
import { CategoryIcon } from "@/components/common/category-icon";
import { Progress } from "@/components/common/progress";
import type { TxnSummary, TxnType } from "@/hooks/use-finance";
import { formatAmount, pct } from "@/lib/format";
import { cn } from "@/lib/utils";

const TOP_CATEGORIES = 4;

/**
 * What the listed transactions add up to: the amount spent (or received, when
 * only income is listed), how that compares with the period before, a bar per
 * day and the biggest categories. Bars and categories narrow the list.
 */
export function PeriodSummary({
  summary,
  type,
  chart,
  compareLabel,
  selectedCategoryIds,
  onPickBar,
  onToggleCategory,
}: {
  summary: TxnSummary;
  /** The list's type filter; income is the headline only for "credit". */
  type?: TxnType;
  /** Dates to draw a bar per day or month for; null when there is nothing to break down. */
  chart: { from: string; to: string; unit: "day" | "month" } | null;
  /** What `summary.previous` covers, e.g. "September", "1–11 Sep" or "yesterday". */
  compareLabel?: string;
  selectedCategoryIds: number[];
  /** `key` is the bar's day (yyyy-MM-dd) or month (yyyy-MM). */
  onPickBar: (key: string) => void;
  onToggleCategory: (id: number) => void;
}) {
  const { totals, previous } = summary;
  const kind = type === "credit" ? "income" : "expense";
  const main = totals[kind];
  const before = previous?.[kind] ?? 0;
  const change = before > 0 ? ((main - before) / before) * 100 : null;
  // Spending more is the bad direction, earning more the good one.
  const worse = kind === "expense" ? main > before : main < before;

  const byMonth = chart?.unit === "month";
  const keyOf = (d: Date) => format(d, byMonth ? "yyyy-MM" : "yyyy-MM-dd");
  const byKey = new Map<string, number>();
  for (const d of summary.days) {
    const key = byMonth ? d.date.slice(0, 7) : d.date;
    byKey.set(key, (byKey.get(key) ?? 0) + d[kind]);
  }
  const interval = chart && {
    start: parseISO(chart.from),
    end: parseISO(chart.to),
  };
  const bars = interval
    ? (byMonth
        ? eachMonthOfInterval(interval)
        : eachDayOfInterval(interval)
      ).map((d) => ({ key: keyOf(d), amount: byKey.get(keyOf(d)) ?? 0 }))
    : [];
  const tick = byMonth ? "MMM" : bars.length <= 7 ? "EEE" : "d";
  const categories = summary.categories
    .filter((c) => c.type === (kind === "income" ? "credit" : "debit"))
    .slice(0, TOP_CATEGORIES);

  return (
    <section className="mb-4 rounded-2xl border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <p className="text-xs text-muted-foreground">
            {kind === "expense" ? "Spent" : "Received"}
          </p>
          <p className="tabular text-2xl font-semibold sm:text-3xl">
            {formatAmount(main)}
          </p>
          {compareLabel && previous && (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              {change === null || main === before ? (
                before > 0 ? (
                  `Same as ${compareLabel}`
                ) : (
                  `Nothing in ${compareLabel} to compare`
                )
              ) : (
                <>
                  <span
                    className={cn(
                      "flex items-center font-medium",
                      worse ? "text-expense" : "text-income",
                    )}
                  >
                    {main > before ? (
                      <ArrowUpRight className="size-3.5" />
                    ) : (
                      <ArrowDownRight className="size-3.5" />
                    )}
                    {pct(Math.abs(change))} {main > before ? "more" : "less"}
                  </span>
                  than {compareLabel} ({formatAmount(before)})
                </>
              )}
            </p>
          )}
        </div>
        <dl className="tabular flex gap-5 text-xs sm:text-sm">
          {!type && (
            <>
              <div>
                <dt className="text-muted-foreground">Income</dt>
                <dd className="font-semibold text-income">
                  +{formatAmount(totals.income)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Net</dt>
                <dd className="font-semibold">
                  {formatAmount(totals.income - totals.expense)}
                </dd>
              </div>
            </>
          )}
          <div>
            <dt className="text-muted-foreground">Entries</dt>
            <dd className="font-semibold">{totals.count}</dd>
          </div>
        </dl>
      </div>

      {main > 0 && (
        <div className="mt-4 grid gap-x-8 gap-y-4 lg:grid-cols-2">
          {bars.length > 1 && (
            <div>
              <p className="mb-1 text-xs text-muted-foreground">
                {kind === "expense" ? "Spent" : "Received"} each{" "}
                {byMonth ? "month" : "day"}
              </p>
              <div className="h-28">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={bars} barCategoryGap="18%">
                    <XAxis
                      dataKey="key"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                      tickFormatter={(k: string) => format(parseISO(k), tick)}
                      interval="preserveStartEnd"
                      minTickGap={12}
                    />
                    <Tooltip
                      cursor={{ fill: "var(--muted)", opacity: 0.6 }}
                      content={
                        <ChartTooltip
                          labelFormatter={(k) =>
                            format(
                              parseISO(k),
                              byMonth ? "MMMM yyyy" : "EEE, d MMM yyyy",
                            )
                          }
                        />
                      }
                    />
                    <Bar
                      dataKey="amount"
                      name={kind === "expense" ? "Spent" : "Received"}
                      fill={kind === "expense" ? EXPENSE_COLOR : INCOME_COLOR}
                      radius={[3, 3, 0, 0]}
                      maxBarSize={20}
                      className="cursor-pointer"
                      isAnimationActive={false}
                      onClick={(bar) =>
                        onPickBar((bar.payload as { key: string }).key)
                      }
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
          {categories.length > 0 && (
            <div>
              <p className="mb-1 text-xs text-muted-foreground">
                Top categories
              </p>
              <ul>
                {categories.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => onToggleCategory(c.id)}
                      aria-pressed={selectedCategoryIds.includes(c.id)}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left text-sm transition-colors hover:bg-muted/60",
                        selectedCategoryIds.includes(c.id) && "bg-accent",
                      )}
                    >
                      <CategoryIcon icon={c.icon} color={c.color} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="truncate">{c.name}</span>
                          <span className="tabular shrink-0 font-medium">
                            {formatAmount(c.total)}
                            <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                              {pct((c.total / main) * 100)}
                            </span>
                          </span>
                        </span>
                        <Progress
                          value={c.total}
                          max={main}
                          color={c.color}
                          className="mt-1 h-1.5"
                        />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
