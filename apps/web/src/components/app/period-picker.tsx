import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  endOfWeek,
  format,
  parseISO,
  startOfWeek,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DateInput } from "@/components/common/date-input";
import { Segmented } from "@/components/common/segmented";
import { Button } from "@/components/ui/button";
import type { Period } from "@/hooks/use-finance";
import { todayStr } from "@/lib/format";

export type PeriodState = {
  period: Period;
  date: string;
  from?: string;
  to?: string;
};

const STEP: Record<Exclude<Period, "custom">, (d: Date, n: number) => Date> = {
  day: addDays,
  week: addWeeks,
  month: addMonths,
  year: addYears,
};

export function periodLabel(s: PeriodState) {
  const d = parseISO(s.date);
  switch (s.period) {
    case "day":
      return s.date === todayStr() ? "Today" : format(d, "EEE, d MMM yyyy");
    case "week": {
      const a = startOfWeek(d, { weekStartsOn: 1 });
      const b = endOfWeek(d, { weekStartsOn: 1 });
      return `${format(a, "d MMM")} – ${format(b, "d MMM yyyy")}`;
    }
    case "month":
      return format(d, "MMMM yyyy");
    case "year":
      return format(d, "yyyy");
    case "custom":
      return s.from && s.to
        ? `${format(parseISO(s.from), "d MMM yyyy")} – ${format(parseISO(s.to), "d MMM yyyy")}`
        : "Pick a range";
  }
}

export function PeriodPicker({
  value,
  onChange,
}: {
  value: PeriodState;
  onChange: (v: PeriodState) => void;
}) {
  const shift = (n: number) => {
    if (value.period === "custom") return;
    onChange({
      ...value,
      date: format(STEP[value.period](parseISO(value.date), n), "yyyy-MM-dd"),
    });
  };
  const isCurrent = value.date === todayStr();

  return (
    <div className="space-y-3">
      <Segmented
        className="w-full sm:w-auto"
        value={value.period}
        onChange={(period) =>
          onChange({
            period,
            date: todayStr(),
            from: value.from ?? format(addMonths(new Date(), -1), "yyyy-MM-dd"),
            to: value.to ?? todayStr(),
          })
        }
        options={[
          { value: "day", label: "Day" },
          { value: "week", label: "Week" },
          { value: "month", label: "Month" },
          { value: "year", label: "Year" },
          { value: "custom", label: "Custom" },
        ]}
      />
      {value.period === "custom" ? (
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
          <DateInput
            aria-label="From date"
            value={value.from ?? ""}
            max={value.to}
            onChange={(v) => onChange({ ...value, from: v })}
            className="sm:w-44"
          />
          <DateInput
            aria-label="To date"
            value={value.to ?? ""}
            min={value.from}
            onChange={(v) => onChange({ ...value, to: v })}
            className="sm:w-44"
          />
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2 rounded-xl border bg-card p-1 sm:inline-flex sm:justify-start">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => shift(-1)}
            aria-label="Previous period"
          >
            <ChevronLeft />
          </Button>
          <span className="min-w-44 text-center text-sm font-semibold">
            {periodLabel(value)}
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => shift(1)}
            aria-label="Next period"
          >
            <ChevronRight />
          </Button>
          {!isCurrent && (
            <Button
              variant="ghost"
              size="sm"
              className="hidden sm:inline-flex"
              onClick={() => onChange({ ...value, date: todayStr() })}
            >
              Today
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
