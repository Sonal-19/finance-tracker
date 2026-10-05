import { CategoryIcon } from "@/components/common/category-icon";
import { Label } from "@/components/ui/label";
import { useActiveAccounts, useEvents } from "@/hooks/use-accounts";
import { useActiveBooks } from "@/hooks/use-books";
import { money, ymd } from "@/lib/format";
import { cn } from "@/lib/utils";

const chip =
  "flex shrink-0 items-center gap-2 rounded-xl border py-1.5 pr-3 pl-1.5 text-left text-sm transition-colors";

/** Horizontal chips of active payment methods (default first). */
export function AccountPicker({
  value,
  onChange,
  label = "Payment method",
  exclude,
}: {
  value: number | null;
  onChange: (id: number) => void;
  label?: string;
  exclude?: number | null;
}) {
  const { list } = useActiveAccounts();
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5">
        {list
          .filter((a) => a.id !== exclude)
          .map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => onChange(a.id)}
              className={cn(
                chip,
                value === a.id ? "border-primary bg-accent" : "hover:bg-muted",
              )}
            >
              <CategoryIcon icon={a.icon} color={a.color} size="sm" />
              <span>
                <span className="block font-medium leading-tight">
                  {a.name}
                </span>
                <span className="tabular block text-[11px] text-muted-foreground">
                  {money(a.balance)}
                </span>
              </span>
            </button>
          ))}
      </div>
    </div>
  );
}

/**
 * Which book an entry goes in. Hidden while the user only has one book,
 * since there is nothing to choose.
 */
export function BookPicker({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (id: number) => void;
}) {
  const { list } = useActiveBooks();
  if (list.length < 2) return null;
  return (
    <div className="space-y-2">
      <Label>Book</Label>
      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5">
        {list.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => onChange(b.id)}
            className={cn(
              chip,
              value === b.id ? "border-primary bg-accent" : "hover:bg-muted",
            )}
          >
            <CategoryIcon icon={b.icon} color={b.color} size="sm" />
            <span>
              <span className="block font-medium leading-tight">{b.name}</span>
              {b.totals === "separate" && (
                <span className="block text-[11px] text-muted-foreground">
                  Not in my totals
                </span>
              )}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * "No event" + events. The active event and events whose dates cover
 * `date` come first; long-past events are tucked after them.
 */
export function EventPicker({
  value,
  onChange,
  date,
}: {
  value: number | null;
  onChange: (id: number | null) => void;
  date?: string;
}) {
  const { data: events = [] } = useEvents();
  if (!events.length) return null;
  const d = date ? ymd(date) : undefined;
  const covers = (e: (typeof events)[number]) =>
    !!d &&
    (!e.startDate || e.startDate <= d) &&
    (!e.endDate || e.endDate >= d) &&
    !!(e.startDate || e.endDate);
  const rank = (e: (typeof events)[number]) =>
    e.id === value
      ? 0
      : e.activeSince
        ? 1
        : covers(e)
          ? 2
          : e.status === "past"
            ? 4
            : 3;
  const sorted = [...events].sort((a, b) => rank(a) - rank(b));

  return (
    <div className="space-y-2">
      <Label>Event (optional)</Label>
      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5">
        <button
          type="button"
          onClick={() => onChange(null)}
          className={cn(
            chip,
            "px-3",
            value === null ? "border-primary bg-accent" : "hover:bg-muted",
          )}
        >
          None
        </button>
        {sorted.map((e) => (
          <button
            key={e.id}
            type="button"
            onClick={() => onChange(e.id)}
            className={cn(
              chip,
              value === e.id ? "border-primary bg-accent" : "hover:bg-muted",
            )}
          >
            <CategoryIcon icon={e.icon} color={e.color} size="sm" />
            <span className="font-medium">{e.name}</span>
            {e.activeSince && (
              <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                LIVE
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
