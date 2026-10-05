import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  getISODay,
  parseISO,
  startOfMonth,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useCalendar } from "@/hooks/use-finance";
import { formatAmount, formatAmountShort, todayStr, ymd } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Month grid; each day's cell is tinted by how much was spent (single-hue sequential). */
export function SpendCalendar({
  onDayClick,
  accountId,
  bookId,
}: {
  onDayClick?: (date: string) => void;
  accountId?: number;
  bookId?: number;
}) {
  const [month, setMonth] = useState(() => format(new Date(), "yyyy-MM"));
  const { data } = useCalendar(month, accountId, bookId);
  const first = parseISO(`${month}-01`);
  const days = eachDayOfInterval({
    start: startOfMonth(first),
    end: endOfMonth(first),
  });
  const byDate = new Map((data?.days ?? []).map((d) => [ymd(d.date), d]));
  const max = Math.max(1, ...[...byDate.values()].map((d) => d.expense));
  const lead = getISODay(days[0]!) - 1;
  const today = todayStr();
  const monthExpense = [...byDate.values()].reduce((a, d) => a + d.expense, 0);
  const monthIncome = [...byDate.values()].reduce((a, d) => a + d.income, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Previous month"
          onClick={() => setMonth(format(addMonths(first, -1), "yyyy-MM"))}
        >
          <ChevronLeft />
        </Button>
        <div className="text-center">
          <p className="font-semibold">{format(first, "MMMM yyyy")}</p>
          <p className="tabular text-xs text-muted-foreground">
            <span className="text-income">+{formatAmount(monthIncome)}</span> ·{" "}
            <span className="text-expense">−{formatAmount(monthExpense)}</span>
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Next month"
          onClick={() => setMonth(format(addMonths(first, 1), "yyyy-MM"))}
        >
          <ChevronRight />
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted-foreground">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: lead }).map((_, i) => (
          <span key={`pad-${i}`} />
        ))}
        {days.map((d) => {
          const key = format(d, "yyyy-MM-dd");
          const v = byDate.get(key);
          const intensity = v ? v.expense / max : 0;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onDayClick?.(key)}
              title={
                v
                  ? `${format(d, "d MMM")}: spent ${formatAmount(v.expense)}, received ${formatAmount(v.income)}`
                  : format(d, "d MMM")
              }
              className={cn(
                "relative flex aspect-square flex-col items-center justify-center rounded-lg border text-xs transition-transform active:scale-95",
                key === today && "ring-2 ring-ring",
                key > today && "opacity-40",
              )}
              style={{
                backgroundColor: intensity
                  ? `color-mix(in oklab, var(--chart-expense) ${Math.round(12 + intensity * 70)}%, var(--card))`
                  : undefined,
              }}
            >
              <span
                className={cn("font-medium", intensity > 0.55 && "text-white")}
              >
                {format(d, "d")}
              </span>
              {v && v.expense > 0 && (
                <span
                  className={cn(
                    "tabular hidden text-[9px] leading-none sm:block",
                    intensity > 0.55
                      ? "text-white/90"
                      : "text-muted-foreground",
                  )}
                >
                  {formatAmountShort(v.expense).replace("₹", "")}
                </span>
              )}
              {v && v.income > 0 && (
                <span className="absolute top-1 right-1 size-1.5 rounded-full bg-chart-income" />
              )}
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Darker = more spent ·{" "}
        <span className="inline-block size-1.5 rounded-full bg-chart-income align-middle" />{" "}
        income received
      </p>
    </div>
  );
}
