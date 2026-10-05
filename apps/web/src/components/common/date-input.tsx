import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isValid,
  parse,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatDate, parseDay, todayStr } from "@/lib/format";
import { cn } from "@/lib/utils";

const DISPLAY = "dd/MM/yyyy";

/** "27092026" → "27/09/2026" while typing. */
function mask(raw: string) {
  const d = raw.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

/** "dd/MM/yyyy" → "yyyy-MM-dd", or null when it isn't a real date. */
function toIso(text: string) {
  if (text.length !== DISPLAY.length) return null;
  const d = parse(text, DISPLAY, new Date());
  return isValid(d) ? format(d, "yyyy-MM-dd") : null;
}

const WEEK = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

/**
 * Date field in the Indian dd/MM/yyyy format. `value` and `onChange` use the API's
 * "yyyy-MM-dd" string ("" when empty), so it drops in wherever `<input type="date">` was.
 */
export function DateInput({
  value,
  onChange,
  min,
  max,
  id,
  className,
  disabled,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  id?: string;
  className?: string;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  const [text, setText] = useState(value ? formatDate(value) : "");
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() =>
    startOfMonth(parseDay(value || todayStr())),
  );

  // Follow outside changes (edit sheets loading a record, presets, resets).
  useEffect(() => {
    setText((t) => (toIso(t) === value ? t : value ? formatDate(value) : ""));
  }, [value]);

  const allowed = (iso: string) =>
    (!min || iso >= min.slice(0, 10)) && (!max || iso <= max.slice(0, 10));

  function type(raw: string) {
    const next = mask(raw);
    setText(next);
    if (next === "") return onChange("");
    const iso = toIso(next);
    if (iso && allowed(iso)) onChange(iso);
  }

  const days = eachDayOfInterval({
    start: startOfWeek(month, { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }),
  });

  return (
    <div className={cn("relative", className)}>
      <Input
        id={id}
        inputMode="numeric"
        autoComplete="off"
        placeholder="dd/mm/yyyy"
        aria-label={ariaLabel}
        disabled={disabled}
        value={text}
        maxLength={10}
        className="pr-10"
        onChange={(e) => type(e.target.value)}
        onBlur={() => setText(value ? formatDate(value) : "")}
      />
      <Popover
        open={open}
        onOpenChange={(o) => {
          if (o) setMonth(startOfMonth(parseDay(value || todayStr())));
          setOpen(o);
        }}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={disabled}
            aria-label="Pick a date"
            className="absolute inset-y-0 right-0 size-11 text-muted-foreground md:size-9"
          >
            <CalendarDays />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 p-3">
          <div className="mb-2 flex items-center justify-between">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label="Previous month"
              onClick={() => setMonth(addMonths(month, -1))}
            >
              <ChevronLeft />
            </Button>
            <span className="text-sm font-semibold">
              {format(month, "MMMM yyyy")}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label="Next month"
              onClick={() => setMonth(addMonths(month, 1))}
            >
              <ChevronRight />
            </Button>
          </div>
          <div className="grid grid-cols-7 text-center text-xs text-muted-foreground">
            {WEEK.map((w) => (
              <span key={w} className="py-1">
                {w}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-y-0.5">
            {days.map((d) => {
              const iso = format(d, "yyyy-MM-dd");
              const inMonth = d.getMonth() === month.getMonth();
              return (
                <button
                  key={iso}
                  type="button"
                  disabled={!allowed(iso)}
                  onClick={() => {
                    onChange(iso);
                    setOpen(false);
                  }}
                  className={cn(
                    "tabular h-8 rounded-md text-sm hover:bg-accent disabled:pointer-events-none disabled:opacity-30",
                    !inMonth && "text-muted-foreground/60",
                    iso === todayStr() && "font-bold text-primary",
                    iso === value &&
                      "bg-primary text-primary-foreground hover:bg-primary",
                  )}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
