import { format, parseISO } from "date-fns";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Summary } from "@/hooks/use-finance";
import { moneyShort } from "@/lib/format";
import {
  ChartTooltip,
  EXPENSE_COLOR,
  INCOME_COLOR,
  Legend,
} from "./chart-tooltip";

export function bucketLabel(key: string, unit: "day" | "month", long = false) {
  if (unit === "month")
    return format(parseISO(`${key}-01`), long ? "MMMM yyyy" : "MMM");
  return format(parseISO(key), long ? "EEE, d MMM yyyy" : "d");
}

export function IncomeExpenseChart({
  data,
  height = 260,
}: {
  data: Summary;
  height?: number;
}) {
  const unit = data.unit;
  const isWeek = data.buckets.length <= 7;
  return (
    <div className="space-y-3">
      <Legend
        items={[
          { label: "Income", color: INCOME_COLOR },
          { label: "Expense", color: EXPENSE_COLOR },
        ]}
      />
      <div style={{ height }} className="-ml-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data.buckets}
            barGap={2}
            barCategoryGap={isWeek ? "30%" : "18%"}
          >
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis
              dataKey="key"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              tickFormatter={(k: string) =>
                isWeek && unit === "day"
                  ? format(parseISO(k), "EEE")
                  : bucketLabel(k, unit)
              }
              interval="preserveStartEnd"
              minTickGap={8}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={48}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              tickFormatter={(v: number) => moneyShort(v)}
            />
            <Tooltip
              cursor={{ fill: "var(--muted)", opacity: 0.6 }}
              content={
                <ChartTooltip
                  labelFormatter={(k) => bucketLabel(k, unit, true)}
                />
              }
            />
            <Bar
              dataKey="income"
              name="Income"
              fill={INCOME_COLOR}
              radius={[4, 4, 0, 0]}
              maxBarSize={28}
            />
            <Bar
              dataKey="expense"
              name="Expense"
              fill={EXPENSE_COLOR}
              radius={[4, 4, 0, 0]}
              maxBarSize={28}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
