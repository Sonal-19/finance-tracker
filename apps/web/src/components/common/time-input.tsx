import { Clock } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

/** "21:05" → "9:05 PM". */
export function timeLabel(value: string) {
  const [h = 0, m = 0] = value.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/**
 * Time of day as `HH:mm` (24h). A grid of hours, five-minute steps and
 * AM/PM instead of `<input type="time">`, so it looks the same everywhere
 * and needs no scrolling inside a phone drawer.
 */
export function TimeInput({
  value,
  onChange,
  id,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [h24 = 9, m = 0] = value.split(":").map(Number);
  const pm = h24 >= 12;
  const h12 = h24 % 12 || 12;
  const set = (hour12: number, minute: number, isPm: boolean) =>
    onChange(
      `${String((hour12 % 12) + (isPm ? 12 : 0)).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    );
  const cell =
    "h-9 rounded-md text-sm tabular transition-colors hover:bg-muted";
  const on = "bg-primary text-primary-foreground hover:bg-primary/90";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          className={cn(
            "h-11 w-full justify-start font-normal md:h-9",
            className,
          )}
        >
          <Clock className="text-muted-foreground" />
          {timeLabel(value)}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-3 p-3" align="start">
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
          {[false, true].map((isPm) => (
            <button
              key={String(isPm)}
              type="button"
              onClick={() => set(h12, m, isPm)}
              className={cn(
                "rounded-md py-1.5 text-sm font-medium text-muted-foreground",
                pm === isPm && "bg-card text-foreground shadow-sm",
              )}
            >
              {isPm ? "PM" : "AM"}
            </button>
          ))}
        </div>
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">Hour</p>
          <div className="grid grid-cols-6 gap-1">
            {HOURS.map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => set(h, m, pm)}
                className={cn(cell, h === h12 && on)}
              >
                {h}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            Minute
          </p>
          <div className="grid grid-cols-6 gap-1">
            {MINUTES.map((mm) => (
              <button
                key={mm}
                type="button"
                onClick={() => {
                  set(h12, mm, pm);
                  setOpen(false);
                }}
                className={cn(cell, mm === m && on)}
              >
                {String(mm).padStart(2, "0")}
              </button>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
