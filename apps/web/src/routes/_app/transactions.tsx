import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  addMonths,
  differenceInCalendarDays,
  endOfMonth,
  format,
  parseISO,
} from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Filter,
  Plus,
  Search as SearchIcon,
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
import { shortDate, todayStr } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useTxnSheet } from "@/stores/txn-sheet-store";

type Search = TxnFilters & {
  /** "yyyy-MM", or "all" for every month. Absent = the current month. A from/to range wins over it. */
  month?: string;
  /** 1-based; only there when a period has more than one page. */
  page?: number;
};

/** Longest from/to range that still gets a bar per day. */
const MAX_CHART_DAYS = 62;

const ymdOf = (d: Date) => format(d, "yyyy-MM-dd");
const monthStart = (month: string) => parseISO(`${month}-01`);
const monthRange = (month: string) => ({
  from: `${month}-01`,
  to: ymdOf(endOfMonth(monthStart(month))),
});

/**
 * What a month is compared with: the whole month before, or, while the month
 * is still running, the same days of the month before.
 */
function previousSpan(month: string, today: string) {
  const start = addMonths(monthStart(month), -1);
  const lastDay = endOfMonth(start).getDate();
  const running = month === today.slice(0, 7);
  const day = running ? Math.min(Number(today.slice(8, 10)), lastDay) : lastDay;
  return {
    from: ymdOf(start),
    to: `${format(start, "yyyy-MM")}-${String(day).padStart(2, "0")}`,
    label: !running
      ? format(start, "MMMM")
      : day === 1
        ? `1 ${format(start, "MMM")}`
        : `1–${day} ${format(start, "MMM")}`,
  };
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
    const month = str("month");
    const page = num("page");
    return {
      accountId: num("accountId") || undefined,
      eventId: num("eventId"),
      type: type === "credit" || type === "debit" ? type : undefined,
      categoryIds: str("categoryIds"),
      from: str("from"),
      to: str("to"),
      q: str("q"),
      month:
        month && /^(\d{4}-(0[1-9]|1[0-2])|all)$/.test(month)
          ? month
          : undefined,
      page: page && page > 1 ? page : undefined,
    };
  },
  component: TransactionsPage,
});

function TransactionsPage() {
  const { month: monthParam, page = 1, ...filters } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  // Changing the filters or the period starts again from the first page.
  const setSearch = (s: Search) => navigate({ search: s, replace: true });
  const setFilters = (f: TxnFilters) => setSearch({ ...f, month: monthParam });
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

  // One month at a time, unless a from/to range (or "all") is asked for.
  const today = todayStr();
  const thisMonth = today.slice(0, 7);
  const month = monthParam ?? thisMonth;
  const ranged = !!(filters.from || filters.to);
  const monthly = !ranged && month !== "all";
  const rangeLabel =
    filters.from === filters.to && filters.from
      ? shortDate(filters.from)
      : `${filters.from ? shortDate(filters.from) : "…"} – ${filters.to ? shortDate(filters.to) : "…"}`;
  const periodLabel = ranged
    ? rangeLabel
    : monthly
      ? format(monthStart(month), "MMMM yyyy")
      : "All time";
  const period = ranged
    ? { from: filters.from, to: filters.to }
    : monthly
      ? monthRange(month)
      : {};
  const previous = monthly ? previousSpan(month, today) : undefined;
  const chartRange =
    period.from &&
    period.to &&
    period.from <= period.to &&
    differenceInCalendarDays(parseISO(period.to), parseISO(period.from)) <
      MAX_CHART_DAYS
      ? { from: period.from, to: period.to }
      : null;

  const top = useRef<HTMLDivElement>(null);
  const toTop = () => top.current?.scrollIntoView({ block: "start" });
  const showMonth = (m: string) => {
    setSearch({
      ...filters,
      from: undefined,
      to: undefined,
      month: m === thisMonth ? undefined : m,
    });
    toTop();
  };
  const monthAt = (n: number) =>
    format(addMonths(monthStart(month), n), "yyyy-MM");

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
    setSearch({ ...filters, month: monthParam, page: n > 1 ? n : undefined });
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
        description="Every credit and debit, month by month."
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
        <div className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-xl border bg-card p-1 sm:flex-none">
          <Button
            variant="ghost"
            size="icon"
            disabled={!monthly}
            onClick={() => showMonth(monthAt(-1))}
            aria-label="Previous month"
          >
            <ChevronLeft />
          </Button>
          <span className="min-w-0 truncate text-center text-sm font-semibold sm:min-w-40">
            {periodLabel}
          </span>
          <Button
            variant="ghost"
            size="icon"
            disabled={!monthly}
            onClick={() => showMonth(monthAt(1))}
            aria-label="Next month"
          >
            <ChevronRight />
          </Button>
        </div>
        {(!monthly || month !== thisMonth) && (
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0"
            onClick={() => showMonth(thisMonth)}
          >
            This month
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
        {filters.q && monthly && (
          <p className="text-xs text-muted-foreground">
            Searching in {periodLabel}.{" "}
            <button
              type="button"
              className="underline"
              onClick={() => setSearch({ ...filters, month: "all" })}
            >
              Search all months
            </button>
          </p>
        )}
      </div>

      {summary.data && (
        <PeriodSummary
          summary={summary.data}
          type={filters.type}
          chartRange={chartRange}
          compareLabel={previous?.label}
          selectedCategoryIds={selectedCats}
          onPickDay={(d) => setFilters({ ...filters, from: d, to: d })}
          onToggleCategory={toggleCategory}
        />
      )}

      {query.isLoading ? (
        <PageLoader />
      ) : query.error ? (
        <ErrorState error={query.error} />
      ) : items.length === 0 ? (
        <EmptyState title="No transactions found">
          {chips.length || filters.q
            ? "Try changing the filters."
            : monthly
              ? `Nothing recorded in ${periodLabel}. Tap + to add an income or expense.`
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
      {monthly && (
        <div className="mt-4 flex justify-between gap-2">
          <Button variant="ghost" onClick={() => showMonth(monthAt(-1))}>
            <ChevronLeft /> {format(monthStart(monthAt(-1)), "MMMM yyyy")}
          </Button>
          {month < thisMonth && (
            <Button variant="ghost" onClick={() => showMonth(monthAt(1))}>
              {format(monthStart(monthAt(1)), "MMMM yyyy")} <ChevronRight />
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
