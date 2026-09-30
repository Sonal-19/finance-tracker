import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type * as React from "react";
import { money } from "@/lib/format";
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
    <div className={cn("rounded-2xl border bg-card p-4", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground sm:text-sm">
          {label}
        </p>
        {icon && (
          <span
            className={cn(
              "grid size-8 place-items-center rounded-full [&_svg]:size-4",
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
      <p className="tabular mt-2 truncate text-xl font-bold sm:text-2xl">
        {display ?? money(value)}
      </p>
      {change !== null && Number.isFinite(change) && (
        <p
          className={cn(
            "mt-1 flex items-center gap-0.5 text-xs",
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
