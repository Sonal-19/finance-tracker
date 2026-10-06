import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type * as React from "react";
import { formatAmount } from "@/lib/format";
import { cn } from "@/lib/utils";

/** KPI tile with change vs the previous period. `goodWhenUp` flips the tone for expenses. */
export function StatCard({
  label,
  value,
  previous,
  icon,
  tone,
  goodWhenUp = true,
  display,
  className,
}: {
  label: string;
  value: number;
  previous?: number;
  icon?: React.ReactNode;
  tone?: "income" | "expense" | "neutral";
  goodWhenUp?: boolean;
  display?: string;
  className?: string;
}) {
  const change =
    previous !== undefined && previous !== 0
      ? ((value - previous) / Math.abs(previous)) * 100
      : null;
  const up = (change ?? 0) >= 0;
  const good = up === goodWhenUp;
  return (
    <div
      className={cn(
        "@container rounded-2xl border bg-card p-3 sm:p-4",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-xs font-medium text-muted-foreground sm:text-sm">
          {label}
        </p>
        {icon && (
          <span
            className={cn(
              "grid size-7 shrink-0 place-items-center rounded-full sm:size-8 [&_svg]:size-4",
              tone === "income" && "bg-income/12 text-income",
              tone === "expense" && "bg-expense/12 text-expense",
              (!tone || tone === "neutral") &&
                "bg-accent text-accent-foreground",
            )}
          >
            {icon}
          </span>
        )}
      </div>
      <p
        className="tabular mt-2 truncate text-base font-bold @[10rem]:text-lg @[12rem]:text-xl @[15rem]:text-2xl"
        title={display ?? formatAmount(value)}
      >
        {display ?? formatAmount(value)}
      </p>
      {change !== null && Number.isFinite(change) && (
        <p
          className={cn(
            "mt-1 flex flex-wrap items-center gap-x-0.5 text-xs",
            good ? "text-income" : "text-expense",
          )}
        >
          {up ? (
            <ArrowUpRight className="size-3.5" />
          ) : (
            <ArrowDownRight className="size-3.5" />
          )}
          {Math.abs(change).toFixed(0)}%{" "}
          <span className="text-muted-foreground">vs previous</span>
        </p>
      )}
    </div>
  );
}
