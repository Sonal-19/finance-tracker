import { formatAmount } from "@/lib/format";

type Item = {
  name?: string | number;
  value?: unknown;
  color?: string;
  dataKey?: unknown;
};

/** Shared hover card: label + one row per series, text in ink colors, swatch carries identity. */
export function ChartTooltip({
  active,
  payload,
  label,
  labelFormatter,
}: {
  active?: boolean;
  payload?: Item[];
  label?: string | number;
  labelFormatter?: (l: string) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-36 rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg">
      {label !== undefined && (
        <p className="mb-1 font-semibold">
          {labelFormatter ? labelFormatter(String(label)) : label}
        </p>
      )}
      {payload.map((p) => (
        <div
          key={String(p.dataKey ?? p.name)}
          className="flex items-center justify-between gap-4"
        >
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: p.color }}
            />
            {p.name}
          </span>
          <span className="tabular font-medium">
            {formatAmount(Number(p.value ?? 0))}
          </span>
        </div>
      ))}
    </div>
  );
}

export function Legend({
  items,
}: {
  items: { label: string; color: string }[];
}) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          <span
            className="size-2.5 rounded-sm"
            style={{ backgroundColor: i.color }}
          />
          {i.label}
        </span>
      ))}
    </div>
  );
}

export const INCOME_COLOR = "var(--chart-income)";
export const EXPENSE_COLOR = "var(--chart-expense)";
