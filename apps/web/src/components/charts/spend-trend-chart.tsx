import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Summary } from "@/hooks/use-finance";
import { formatAmountShort } from "@/lib/format";
import { ChartTooltip, EXPENSE_COLOR } from "./chart-tooltip";
import { bucketLabel } from "./income-expense-chart";

/** Cumulative spend across the period — shows how fast money leaves. */
export function SpendTrendChart({
  data,
  height = 220,
}: {
  data: Summary;
  height?: number;
}) {
  return (
    <div style={{ height }} className="-ml-2">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data.buckets}>
          <defs>
            <linearGradient id="spendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={EXPENSE_COLOR} stopOpacity={0.25} />
              <stop offset="100%" stopColor={EXPENSE_COLOR} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis
            dataKey="key"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            tickFormatter={(k: string) => bucketLabel(k, data.unit)}
            interval="preserveStartEnd"
            minTickGap={12}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={48}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            tickFormatter={(v: number) => formatAmountShort(v)}
          />
          <Tooltip
            cursor={{
              stroke: "var(--muted-foreground)",
              strokeDasharray: "3 3",
            }}
            content={
              <ChartTooltip
                labelFormatter={(k) => bucketLabel(k, data.unit, true)}
              />
            }
          />
          <Area
            type="monotone"
            dataKey="cumulativeExpense"
            name="Spent so far"
            stroke={EXPENSE_COLOR}
            strokeWidth={2}
            fill="url(#spendFill)"
            activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--card)" }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
