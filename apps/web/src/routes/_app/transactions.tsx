import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Download, Filter, Plus, Search as SearchIcon, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CategoryIcon } from "@/components/common/category-icon";
import { PageHeader } from "@/components/common/page-header";
import { ResponsiveSheet } from "@/components/common/responsive-sheet";
import { Segmented } from "@/components/common/segmented";
import {
  EmptyState,
  ErrorState,
  PageLoader,
  Spinner,
} from "@/components/common/states";
import { GroupedTransactions } from "@/components/transactions/transaction-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAccounts, useEvents } from "@/hooks/use-accounts";
import {
  type TxnFilters,
  useCategories,
  useTransactions,
} from "@/hooks/use-finance";
import { money, PAYMENT_METHODS, paymentLabel, shortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useTxnSheet } from "@/stores/txn-sheet-store";

type Search = TxnFilters;

export const Route = createFileRoute("/_app/transactions")({
  validateSearch: (s: Record<string, unknown>): Search => {
    const str = (k: string) =>
      typeof s[k] === "string" && s[k] ? (s[k] as string) : undefined;
    const type = str("type");
    const pm = str("paymentMethod");
    const num = (k: string) => {
      const n = Number(s[k]);
      return Number.isInteger(n) && n >= 0 && s[k] !== undefined && s[k] !== ""
        ? n
        : undefined;
    };
    return {
      accountId: num("accountId") || undefined,
      eventId: num("eventId"),
      type: type === "credit" || type === "debit" ? type : undefined,
      categoryIds: str("categoryIds"),
      paymentMethod: PAYMENT_METHODS.some((p) => p.value === pm)
        ? (pm as Search["paymentMethod"])
        : undefined,
      from: str("from"),
      to: str("to"),
      q: str("q"),
    };
  },
  component: TransactionsPage,
});

function TransactionsPage() {
  const filters = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const setFilters = (f: Search) => navigate({ search: f, replace: true });
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

  const query = useTransactions(filters);
  const pages = query.data?.pages ?? [];
  const items = pages.flatMap((p) => p.items);
  const dayTotals = Object.assign({}, ...pages.map((p) => p.dayTotals));
  const totals = pages[0]?.totals;

  // Infinite scroll
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (
          entries[0]?.isIntersecting &&
          query.hasNextPage &&
          !query.isFetchingNextPage
        )
          query.fetchNextPage();
      },
      { rootMargin: "400px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [query]);

  const selectedCats = filters.categoryIds?.split(",").map(Number) ?? [];
  const chips: { label: string; clear: () => void }[] = [];
  if (filters.type)
    chips.push({
      label: filters.type === "credit" ? "Income" : "Expense",
      clear: () => setFilters({ ...filters, type: undefined }),
    });
  for (const id of selectedCats) {
    const c = categories.find((x) => x.id === id);
    if (c)
      chips.push({
        label: c.name,
        clear: () =>
          setFilters({
            ...filters,
            categoryIds:
              selectedCats.filter((x) => x !== id).join(",") || undefined,
          }),
      });
  }
  if (filters.paymentMethod)
    chips.push({
      label: paymentLabel(filters.paymentMethod),
      clear: () => setFilters({ ...filters, paymentMethod: undefined }),
    });
  if (filters.accountId)
    chips.push({
      label:
        accounts.find((a) => a.id === filters.accountId)?.name ?? "Account",
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
  if (filters.from || filters.to)
    chips.push({
      label:
        filters.from === filters.to && filters.from
          ? shortDate(filters.from)
          : `${filters.from ? shortDate(filters.from) : "…"} – ${filters.to ? shortDate(filters.to) : "…"}`,
      clear: () => setFilters({ ...filters, from: undefined, to: undefined }),
    });

  const exportUrl = `/api/transactions/export.csv?${new URLSearchParams(
    Object.entries(filters)
      .filter(([, v]) => v !== undefined && v !== "")
      .map(([k, v]) => [k, String(v)]),
  ).toString()}`;

  return (
    <div>
      <PageHeader
        title="Transactions"
        description="Every credit and debit, date-wise."
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
      </div>

      {totals && (
        <div className="mb-4 grid grid-cols-3 gap-2 rounded-2xl border bg-card p-3 text-center text-xs sm:text-sm">
          <div>
            <p className="text-muted-foreground">Income</p>
            <p className="tabular font-semibold text-income">
              {money(totals.income)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Expense</p>
            <p className="tabular font-semibold text-expense">
              {money(totals.expense)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">
              {totals.count} entries · Net
            </p>
            <p className="tabular font-semibold">
              {money(totals.income - totals.expense)}
            </p>
          </div>
        </div>
      )}

      {query.isLoading ? (
        <PageLoader />
      ) : query.error ? (
        <ErrorState error={query.error} />
      ) : items.length === 0 ? (
        <EmptyState title="No transactions found">
          {chips.length || filters.q
            ? "Try changing the filters."
            : "Tap + to add your first income or expense."}
        </EmptyState>
      ) : (
        <GroupedTransactions items={items} dayTotals={dayTotals} />
      )}
      <div ref={sentinel} className="grid h-16 place-items-center">
        {query.isFetchingNextPage && <Spinner />}
      </div>

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
  filters: Search;
  onApply: (f: Search) => void;
}) {
  const { data: categories = [] } = useCategories();
  const accounts = useAccounts().data?.accounts ?? [];
  const { data: events = [] } = useEvents();
  const [draft, setDraft] = useState<Search>(filters);
  useEffect(() => {
    if (open) setDraft(filters);
  }, [open, filters]);
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
            <Input
              type="date"
              aria-label="From"
              value={draft.from ?? ""}
              onChange={(e) =>
                setDraft({ ...draft, from: e.target.value || undefined })
              }
            />
            <Input
              type="date"
              aria-label="To"
              value={draft.to ?? ""}
              onChange={(e) =>
                setDraft({ ...draft, to: e.target.value || undefined })
              }
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Account</Label>
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
          <Label>Payment method</Label>
          <div className="flex flex-wrap gap-2">
            {PAYMENT_METHODS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() =>
                  setDraft({
                    ...draft,
                    paymentMethod:
                      draft.paymentMethod === p.value ? undefined : p.value,
                  })
                }
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm",
                  draft.paymentMethod === p.value &&
                    "border-primary bg-primary text-primary-foreground",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
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
