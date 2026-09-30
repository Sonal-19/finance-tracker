import { cn } from "@/lib/utils";

/** Green under 80%, amber 80–100%, red over budget. */
export function budgetTone(ratio: number) {
  if (ratio > 1) return "bg-expense";
  if (ratio >= 0.8) return "bg-warning";
  return "bg-income";
}

export function Progress({
  value,
  max,
  className,
  barClassName,
  color,
}: {
  value: number;
  max: number;
  className?: string;
  barClassName?: string;
  color?: string;
}) {
  const ratio = max > 0 ? value / max : 0;
  return (
    <div
      className={cn(
        "h-2 w-full overflow-hidden rounded-full bg-muted",
        className,
      )}
    >
      <div
        className={cn(
          "h-full rounded-full transition-all duration-500",
          color ? "" : budgetTone(ratio),
          barClassName,
        )}
        style={{
          width: `${Math.min(100, ratio * 100)}%`,
          backgroundColor: color,
        }}
      />
    </div>
  );
}
