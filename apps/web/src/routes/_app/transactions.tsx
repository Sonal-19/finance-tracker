import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  differenceInCalendarDays,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from "date-fns";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Filter,
  Plus,
  Search as SearchIcon,
  Undo2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CategoryIcon } from "@/components/common/category-icon";
import { DateInput } from "@/components/common/date-input";
import { PageHeader } from "@/components/common/page-header";
import { ResponsiveSheet } from "@/components/common/responsive-sheet";
import { Segmented } from "@/components/common/segmented";
import { EmptyState, ErrorState, PageLoader } from "@/components/common/states";
import { PeriodSummary } from "@/components/transactions/period-summary";
import { GroupedTransactions } from "@/components/transactions/transaction-list";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAccounts, useEvents } from "@/hooks/use-accounts";
import { useBookScope } from "@/hooks/use-books";
import {
  TXN_PAGE_SIZE,
  type TxnFilters,
  useCategories,
  useTransactionsPage,
  useTransactionsSummary,
} from "@/hooks/use-finance";
import { dayLabel, shortDate, todayStr } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useTxnSheet } from "@/stores/txn-sheet-store";

const MODES = ["day", "week", "month", "year"] as const;
type Mode = (typeof MODES)[number];
type Range = { from: string; to: string };

type Search = TxnFilters & {
  /** How much is listed at once. Absent = a month; "all" = everything. A from/to range wins over it. */
  period?: Exclude<Mode, "month"> | "all";
  /** First day of the period shown. Absent = the period today is in. */
  date?: string;
  /** 1-based; only there when a period has more than one page. */
  page?: number;
};

/** Longest from/to range that still gets a bar per day. */
const MAX_CHART_DAYS = 62;

const ymdOf = (d: Date) => format(d, "yyyy-MM-dd");
const same = (d: Date) => d;
const MODE: Record<
  Mode,
  {
    label: string;
    short: string;
    current: string;
    start: (d: Date) => Date;
    end: (d: Date) => Date;
    step: (d: Date, n: number) => Date;
  }
> = {
  day: {
    label: "Daily",
    short: "Day",
    current: "Today",
    start: same,
    end: same,
    step: addDays,
  },
  // Weeks run Monday to Sunday, as in Reports.
  week: {
    label: "Weekly",
    short: "Week",
    current: "This week",
    start: (d) => startOfWeek(d, { weekStartsOn: 1 }),
    end: (d) => endOfWeek(d, { weekStartsOn: 1 }),
    step: addWeeks,
  },
  month: {
    label: "Monthly",
    short: "Month",
    current: "This month",
    start: startOfMonth,
    end: endOfMonth,
    step: addMonths,
  },
  year: {
    label: "Yearly",
    short: "Year",
    current: "This year",
    start: startOfYear,
    end: endOfYear,
    step: addYears,
  },
};

/** The day, week, month or year that `date` falls in. */
function periodRange(mode: Mode, date: string): Range {
  const d = parseISO(date);
  return { from: ymdOf(MODE[mode].start(d)), to: ymdOf(MODE[mode].end(d)) };
}

function spanLabel(mode: Mode, r: Range, today: string) {
  const from = parseISO(r.from);
  switch (mode) {
    case "day":
      return dayLabel(r.from);
    case "week": {
      // The year is left out for this year's weeks so the label fits a phone.
      const to = parseISO(r.to);
      const end = r.to.slice(0, 4) === today.slice(0, 4) ? "d MMM" : "d MMM yy";
      return `${format(from, r.from.slice(0, 7) === r.to.slice(0, 7) ? "d" : "d MMM")} – ${format(to, end)}`;
    }
    case "month":
      return format(from, "MMMM yyyy");
    case "year":
      return format(from, "yyyy");
  }
}

/**
 * What a period is compared with: the whole period before, or, while the
 * period is still running, the same number of days at the start of that one.
 */
function previousSpan(mode: Mode, r: Range, today: string) {
  const start = MODE[mode].step(parseISO(r.from), -1);
  const whole = MODE[mode].end(start);
  const running = r.from <= today && today < r.to;
  const sameDays = addDays(
    start,
    differenceInCalendarDays(parseISO(today), parseISO(r.from)),
  );
  const end = running && sameDays < whole ? sameDays : whole;
  const from = ymdOf(start);
  const label = {
    day: () => {
      const l = dayLabel(from);
      return l === "Yesterday" || l === "Today" ? l.toLowerCase() : l;
    },
    week: () => (running ? "the same days last week" : "the week before"),
    month: () =>
      !running
        ? format(start, "MMMM")
        : end.getDate() === 1
          ? `1 ${format(start, "MMM")}`
          : `1–${end.getDate()} ${format(start, "MMM")}`,
    year: () =>
      running ? `1 Jan – ${format(end, "d MMM yyyy")}` : format(start, "yyyy"),
  }[mode]();
  return { from, to: ymdOf(end), label };
}

export const Route = createFileRoute("/_app/transactions")({
  validateSearch: (s: Record<string, unknown>): Search => {
    const str = (k: string) =>
      typeof s[k] === "string" && s[k] ? (s[k] as string) : undefined;
    const type = str("type");
    const num = (k: string) => {
      const n = Number(s[k]);
      return Number.isInteger(n) && n >= 0 && s[k] !== undefined && s[k] !== ""
        ? n
        : undefined;
    };
    const period = str("period");
    const date = str("date");
    const page = num("page");
    return {
      accountId: num("accountId") || undefined,
      eventId: num("eventId"),
      type: type === "credit" || type === "debit" ? type : undefined,
      categoryIds: str("categoryIds"),
      from: str("from"),
      to: str("to"),
      q: str("q"),
      period:
        period === "day" ||
        period === "week" ||
        period === "year" ||
        period === "all"
          ? period
          : undefined,
      date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined,
      page: page && page > 1 ? page : undefined,
    };
  },
  component: TransactionsPage,
});

function TransactionsPage() {
  const {
    period: periodParam,
    date: dateParam,
    page = 1,
    ...filters
  } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  // Changing the filters or the period starts again from the first page.
  const setSearch = (s: Search) => navigate({ search: s, replace: true });
  const setFilters = (f: TxnFilters) =>
    setSearch({ ...f, period: periodParam, date: dateParam });
  const [q, setQ] = useState(filters.q ?? "");
  const [filterOpen, setFilterOpen] = useState(false);
  const openNew = useTxnSheet((s) => s.openNew);
  const { data: categories = [] } = useCategories();
  const accounts = useAccounts().data?.accounts ?? [];
  const { data: events = [] } = useEvents();

  // Debounce search typing into the URL.
  useEffect(() => {
    const t = setTimeout(() => {
      if ((filters.q ?? "") !== q)
        setFilters({ ...filters, q: q || undefined });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  // One period (a month unless another is picked) at a time; a from/to range
  // or "all" shows everything that matches instead.
  const today = todayStr();
  const ranged = !!(filters.from || filters.to);
  const view = periodParam ?? "month";
  const mode = ranged || view === "all" ? null : view;
  const span = mode ? periodRange(mode, dateParam ?? today) : null;
  const current = !!span && span.from <= today && today <= span.to;
  const rangeLabel =
    filters.from === filters.to && filters.from
      ? shortDate(filters.from)
      : `${filters.from ? shortDate(filters.from) : "…"} – ${filters.to ? shortDate(filters.to) : "…"}`;
  const periodLabel = ranged
    ? rangeLabel
    : mode && span
      ? spanLabel(mode, span, today)
      : "All time";
  const period: { from?: string; to?: string } = ranged
    ? { from: filters.from, to: filters.to }
    : (span ?? {});
  const previous = mode && span ? previousSpan(mode, span, today) : undefined;
  // A year gets a bar per month, anything shorter a bar per day.
  const chart =
    mode === "year" && span
      ? { ...span, unit: "month" as const }
      : period.from &&
          period.to &&
          period.from < period.to &&
          differenceInCalendarDays(parseISO(period.to), parseISO(period.from)) <
            MAX_CHART_DAYS
        ? { from: period.from, to: period.to, unit: "day" as const }
        : null;

  const top = useRef<HTMLDivElement>(null);
  const toTop = () => top.current?.scrollIntoView({ block: "start" });
  /** Shows the `v` that `date` falls in (today's when left out). */
  const showPeriod = (v: Mode | "all", date?: string) => {
    const r = v !== "all" && date ? periodRange(v, date) : null;
    setSearch({
      ...filters,
      from: undefined,
      to: undefined,
      period: v === "month" ? undefined : v,
      date: r && !(r.from <= today && today <= r.to) ? r.from : undefined,
    });
    toTop();
  };
  const stepped = (n: number) =>
    mode && span ? ymdOf(MODE[mode].step(parseISO(span.from), n)) : today;
  const steppedLabel = (n: number) =>
    mode ? spanLabel(mode, periodRange(mode, stepped(n)), today) : "";

  // The header's book switcher narrows the list; it isn't part of the URL.
  const { bookId } = useBookScope();
  const scoped = { ...filters, ...period, bookId };
  const query = useTransactionsPage(scoped, page);
  const summary = useTransactionsSummary(
    scoped,
    previous && { from: previous.from, to: previous.to },
  );
  const items = query.data?.items ?? [];
  const count = query.data?.totals.count ?? 0;
  const pageCount = Math.max(1, Math.ceil(count / TXN_PAGE_SIZE));
  const showPage = (n: number) => {
    setSearch({
      ...filters,
      period: periodParam,
      date: dateParam,
      page: n > 1 ? n : undefined,
    });
    toTop();
  };
  // A page that no longer exists (entries deleted, stale link) falls back to the last one.
  useEffect(() => {
    if (query.data && !query.isPlaceholderData && page > pageCount)
      showPage(pageCount);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data, query.isPlaceholderData, page, pageCount]);

  const selectedCats = filters.categoryIds?.split(",").map(Number) ?? [];
  const toggleCategory = (id: number) =>
    setFilters({
      ...filters,
      categoryIds:
        (selectedCats.includes(id)
          ? selectedCats.filter((x) => x !== id)
          : [...selectedCats, id]
        ).join(",") || undefined,
    });
  const chips: { label: string; clear: () => void }[] = [];
  if (filters.type)
    chips.push({
      label: filters.type === "credit" ? "Income" : "Expense",
      clear: () => setFilters({ ...filters, type: undefined }),
    });
  for (const id of selectedCats) {
    const c = categories.find((x) => x.id === id);
    if (c) chips.push({ label: c.name, clear: () => toggleCategory(id) });
  }
  if (filters.accountId)
    chips.push({
      label:
        accounts.find((a) => a.id === filters.accountId)?.name ??
        "Payment method",
      clear: () => setFilters({ ...filters, accountId: undefined }),
    });
  if (filters.eventId !== undefined)
    chips.push({
      label:
        filters.eventId === 0
          ? "No event"
          : (events.find((e) => e.id === filters.eventId)?.name ?? "Event"),
      clear: () => setFilters({ ...filters, eventId: undefined }),
    });
  if (ranged)
    chips.push({
      label: rangeLabel,
      clear: () => setFilters({ ...filters, from: undefined, to: undefined }),
    });

  const exportUrl = `/api/transactions/export.csv?${new URLSearchParams(
    Object.entries(scoped)
      .filter(([, v]) => v !== undefined && v !== "")
      .map(([k, v]) => [k, String(v)]),
  ).toString()}`;

  return (
    <div ref={top} className="scroll-mt-16">
      <PageHeader
        title="Transactions"
        description="Every credit and debit, one period at a time."
        actions={
          <>
            <Button variant="outline" asChild>
              <a href={exportUrl} download>
                <Download />{" "}
                <span className="hidden sm:inline">Export CSV</span>
              </a>
            </Button>
            <Button onClick={() => openNew()} className="hidden md:inline-flex">
              <Plus /> Add
            </Button>
          </>
        }
      />

      <div className="mb-3 flex items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center justify-between gap-1 rounded-xl border bg-card p-1 sm:flex-none sm:gap-2">
          <Button
            variant="ghost"
            size="icon"
            disabled={!mode}
            onClick={() => mode && showPeriod(mode, stepped(-1))}
            aria-label="Previous period"
          >
            <ChevronLeft />
          </Button>
          <span className="min-w-0 truncate text-center text-sm font-semibold sm:min-w-40">
            {periodLabel}
          </span>
          <Button
            variant="ghost"
            size="icon"
            disabled={!mode}
            onClick={() => mode && showPeriod(mode, stepped(1))}
            aria-label="Next period"
          >
            <ChevronRight />
          </Button>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="shrink-0 gap-1"
              aria-label="Change how much is shown at once"
            >
              {mode ? (
                <>
                  <span className="sm:hidden">{MODE[mode].short}</span>
                  <span className="hidden sm:inline">{MODE[mode].label}</span>
                </>
              ) : ranged ? (
                "Range"
              ) : (
                "All time"
              )}
              <ChevronDown className="text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuRadioGroup
              value={mode ?? (ranged ? "" : "all")}
              onValueChange={(v) =>
                // Stay on the period being looked at unless it's the current one.
                showPeriod(
                  v as Mode | "all",
                  current || !span ? undefined : span.from,
                )
              }
            >
              {MODES.map((m) => (
                <DropdownMenuRadioItem key={m} value={m}>
                  {MODE[m].label}
                </DropdownMenuRadioItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuRadioItem value="all">
                All time
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        {!current && (
          <Button
            variant="ghost"
            className="shrink-0 max-sm:size-9 max-sm:px-0"
            onClick={() => showPeriod(mode ?? "month")}
            aria-label={MODE[mode ?? "month"].current}
          >
            <Undo2 className="sm:hidden" />
            <span className="hidden sm:inline">
              {MODE[mode ?? "month"].current}
            </span>
          </Button>
        )}
      </div>

      <div className="sticky top-14 z-20 -mx-4 space-y-3 bg-background/90 px-4 pb-3 backdrop-blur md:static md:mx-0 md:bg-transparent md:px-0 md:backdrop-blur-none">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search notes or categories"
              className="pl-9"
              aria-label="Search transactions"
              data-search-input
            />
          </div>
          <Button
            variant="outline"
            size="icon"
            className="relative size-11 md:size-9"
            onClick={() => setFilterOpen(true)}
            aria-label="Filters"
          >
            <Filter />
            {chips.length > 0 && (
              <span className="absolute -top-1 -right-1 grid size-4.5 place-items-center rounded-full bg-primary text-[10px] text-primary-foreground">
                {chips.length}
              </span>
            )}
          </Button>
        </div>
        <Segmented
          size="sm"
          value={filters.type ?? "all"}
          onChange={(v) =>
            setFilters({ ...filters, type: v === "all" ? undefined : v })
          }
          options={[
            { value: "all", label: "All" },
            { value: "debit", label: "Expenses" },
            { value: "credit", label: "Income" },
          ]}
        />
        {chips.length > 0 && (
          <div className="no-scrollbar flex gap-2 overflow-x-auto">
            {chips.map((c) => (
              <button
                key={c.label}
                type="button"
                onClick={c.clear}
                className="flex shrink-0 items-center gap-1 rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground"
              >
                {c.label} <X className="size-3" />
              </button>
            ))}
            <button
              type="button"
              className="shrink-0 px-2 text-xs text-muted-foreground underline"
              onClick={() => {
                setQ("");
                setFilters({});
              }}
            >
              Clear all
            </button>
          </div>
        )}
        {filters.q && mode && (
          <p className="text-xs text-muted-foreground">
            Searching in {periodLabel}.{" "}
            <button
              type="button"
              className="underline"
              onClick={() => showPeriod("all")}
            >
              Search all time
            </button>
          </p>
        )}
      </div>

      {summary.data && (
        <PeriodSummary
          summary={summary.data}
          type={filters.type}
          chart={chart}
          compareLabel={previous?.label}
          selectedCategoryIds={selectedCats}
          onPickBar={(key) =>
            chart?.unit === "month"
              ? showPeriod("month", `${key}-01`)
              : showPeriod("day", key)
          }
          onToggleCategory={toggleCategory}
        />
      )}

      {query.isLoading ? (
        <PageLoader />
      ) : query.error && !query.data ? (
        <ErrorState error={query.error} />
      ) : items.length === 0 ? (
        <EmptyState title="No transactions found">
          {chips.length || filters.q
            ? "Try changing the filters."
            : mode
              ? "Nothing recorded in this period. Tap + to add an income or expense."
              : "Tap + to add your first income or expense."}
        </EmptyState>
      ) : (
        <GroupedTransactions
          items={items}
          dayTotals={query.data?.dayTotals ?? {}}
        />
      )}

      {pageCount > 1 && (
        <nav
          aria-label="Pages"
          className="mt-4 flex items-center justify-between gap-2"
        >
          <Button
            variant="outline"
            disabled={page <= 1}
            onClick={() => showPage(page - 1)}
          >
            <ChevronLeft /> Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {Math.min(page, pageCount)} of {pageCount}
          </span>
          <Button
            variant="outline"
            disabled={page >= pageCount}
            onClick={() => showPage(page + 1)}
          >
            Next <ChevronRight />
          </Button>
        </nav>
      )}
      {mode && span && (
        <div className="mt-4 flex justify-between gap-2">
          <Button variant="ghost" onClick={() => showPeriod(mode, stepped(-1))}>
            <ChevronLeft /> {steppedLabel(-1)}
          </Button>
          {span.to < today && (
            <Button
              variant="ghost"
              onClick={() => showPeriod(mode, stepped(1))}
            >
              {steppedLabel(1)} <ChevronRight />
            </Button>
          )}
        </div>
      )}

      <FilterSheet
        open={filterOpen}
        onOpenChange={setFilterOpen}
        filters={filters}
        onApply={(f) => {
          setFilters({ ...f, q: filters.q });
          setFilterOpen(false);
        }}
      />
    </div>
  );
}

function FilterSheet({
  open,
  onOpenChange,
  filters,
  onApply,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  filters: TxnFilters;
  onApply: (f: TxnFilters) => void;
}) {
  const { data: categories = [] } = useCategories();
  const accounts = useAccounts().data?.accounts ?? [];
  const { data: events = [] } = useEvents();
  const [draft, setDraft] = useState<TxnFilters>(filters);
  // Only on opening: `filters` is a fresh object on every render of the page.
  useEffect(() => {
    if (open) setDraft(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const selected = new Set(draft.categoryIds?.split(",").map(Number) ?? []);
  const toggleCat = (id: number) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setDraft({ ...draft, categoryIds: [...next].join(",") || undefined });
  };
  const visibleCats = categories.filter(
    (c) => !draft.type || c.type === draft.type,
  );

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Filter transactions"
    >
      <div className="space-y-5">
        <div className="space-y-2">
          <Label>Date range</Label>
          <div className="grid grid-cols-2 gap-2">
            <DateInput
              aria-label="From"
              value={draft.from ?? ""}
              onChange={(v) => setDraft({ ...draft, from: v || undefined })}
            />
            <DateInput
              aria-label="To"
              value={draft.to ?? ""}
              onChange={(v) => setDraft({ ...draft, to: v || undefined })}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Payment method</Label>
          <div className="flex flex-wrap gap-2">
            {accounts.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() =>
                  setDraft({
                    ...draft,
                    accountId: draft.accountId === a.id ? undefined : a.id,
                  })
                }
                className={cn(
                  "flex items-center gap-1.5 rounded-full border py-1 pr-3 pl-1 text-sm",
                  draft.accountId === a.id &&
                    "border-primary bg-primary text-primary-foreground",
                )}
              >
                <CategoryIcon
                  icon={a.icon}
                  color={a.color}
                  className="size-6 [&_svg]:size-3.5"
                />
                {a.name}
              </button>
            ))}
          </div>
        </div>
        {events.length > 0 && (
          <div className="space-y-2">
            <Label>Event</Label>
            <div className="flex flex-wrap gap-2">
              {[{ id: 0, name: "Not in any event" }, ...events].map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      eventId: draft.eventId === e.id ? undefined : e.id,
                    })
                  }
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-sm",
                    draft.eventId === e.id &&
                      "border-primary bg-primary text-primary-foreground",
                  )}
                >
                  {e.name}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="space-y-2">
          <Label>Categories</Label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {visibleCats.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => toggleCat(c.id)}
                className={cn(
                  "flex items-center gap-2 rounded-xl border p-2 text-left text-sm",
                  selected.has(c.id) && "border-ring bg-accent",
                )}
              >
                <CategoryIcon icon={c.icon} color={c.color} size="sm" />
                <span className="truncate">{c.name}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => onApply({})}
          >
            Reset
          </Button>
          <Button className="flex-1" onClick={() => onApply(draft)}>
            Apply filters
          </Button>
        </div>
      </div>
    </ResponsiveSheet>
  );
}
