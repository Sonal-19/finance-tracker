import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { CategoryIcon } from "@/components/common/category-icon";
import { EmptyState } from "@/components/common/states";
import { money, moneyShort } from "@/lib/format";
import { ChartTooltip } from "./chart-tooltip";

type Row = {
  id: number;
  name: string;
  icon: string;
  color: string;
  total: number;
  count: number;
};

const MAX_SLICES = 6;

/** Donut + ranked list (the list doubles as legend and table view). */
export function CategoryDonut({
  rows,
  label = "Spent",
  compact,
}: {
  rows: Row[];
  label?: string;
  compact?: boolean;
}) {
  const total = rows.reduce((a, r) => a + r.total, 0);
  if (!rows.length || total === 0)
    return <EmptyState title="Nothing here yet" className="border-none p-6" />;

  const top = rows.slice(0, MAX_SLICES);
  const rest = rows.slice(MAX_SLICES);
  const slices = rest.length
    ? [
        ...top,
        {
          id: -1,
          name: "Other",
          icon: "circle-ellipsis",
          color: "#94a3b8",
          total: rest.reduce((a, r) => a + r.total, 0),
          count: rest.reduce((a, r) => a + r.count, 0),
        },
      ]
    : top;

  return (
    <div className="@container">
      <div
        className={
          compact
            ? "grid gap-4 @md:grid-cols-[170px_1fr] @md:items-center"
            : "grid gap-6 @xl:grid-cols-[220px_1fr] @xl:items-center"
        }
      >
        <div className="relative mx-auto aspect-square w-full max-w-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={slices}
                dataKey="total"
                nameKey="name"
                innerRadius="68%"
                outerRadius="100%"
                paddingAngle={1.5}
                stroke="var(--card)"
                strokeWidth={2}
                cornerRadius={4}
                isAnimationActive={false}
              >
                {slices.map((s) => (
                  <Cell key={s.id} fill={s.color} />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
            <div>
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="tabular text-lg font-bold">{moneyShort(total)}</p>
            </div>
          </div>
        </div>
        <ul className="space-y-2.5">
          {slices.slice(0, compact ? 5 : undefined).map((s) => {
            const share = (s.total / total) * 100;
            return (
              <li key={s.id} className="flex items-center gap-3">
                <CategoryIcon icon={s.icon} color={s.color} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="truncate font-medium">{s.name}</span>
                    <span className="tabular shrink-0 font-semibold">
                      {money(s.total)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${share}%`, backgroundColor: s.color }}
                      />
                    </div>
                    <span className="tabular w-10 text-right text-xs text-muted-foreground">
                      {share.toFixed(0)}%
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
