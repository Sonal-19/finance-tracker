import { format, subDays } from "date-fns";
import { ArrowRightLeft, Pencil, Trash2, Users } from "lucide-react";
import { useEffect, useState } from "react";
import {
  AccountPicker,
  BookPicker,
  EventPicker,
} from "@/components/app/pickers";
import { CategoryIcon } from "@/components/common/category-icon";
import { confirm } from "@/components/common/confirm-dialog";
import { DateInput } from "@/components/common/date-input";
import { ResponsiveSheet } from "@/components/common/responsive-sheet";
import { Segmented } from "@/components/common/segmented";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useActiveAccounts, useActiveEvent } from "@/hooks/use-accounts";
import { useActiveBooks, useBookScope } from "@/hooks/use-books";
import {
  type Currency,
  type TxnType,
  useCategories,
  useDeleteTransaction,
  useFxRate,
  useSaveTransaction,
} from "@/hooks/use-finance";
import {
  formatAmount,
  fromAmount,
  shortDate,
  toAmount,
  todayStr,
  ymd,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { useSplitSheet } from "@/stores/split-sheet-store";
import { useTxnSheet } from "@/stores/txn-sheet-store";

type Form = {
  type: TxnType;
  amount: string;
  categoryId: number | null;
  date: string;
  note: string;
  currency: Currency;
  /** Manual USD→INR rate; "" = use the day's market rate. */
  fxRate: string;
  accountId: number | null;
  bookId: number | null;
  eventId: number | null;
};

const SYMBOL: Record<Currency, string> = { INR: "₹", USD: "$" };

export function TransactionSheet() {
  const { open, editing, defaultType, prefill, close } = useTxnSheet();
  const openSplitNew = useSplitSheet((s) => s.openNew);
  const openSplitEdit = useSplitSheet((s) => s.openEdit);
  const { data: categories = [] } = useCategories();
  const { defaultAccount } = useActiveAccounts();
  const activeEvent = useActiveEvent();
  const { defaultBook } = useActiveBooks();
  const scope = useBookScope();
  const save = useSaveTransaction();
  const del = useDeleteTransaction();

  const blank = (type: TxnType): Form => ({
    type,
    amount: "",
    categoryId: null,
    date: todayStr(),
    note: "",
    currency: "INR",
    fxRate: "",
    accountId: prefill.accountId ?? defaultAccount?.id ?? null,
    // The book being viewed in the header switcher, else the default one.
    bookId: prefill.bookId ?? scope.bookId ?? defaultBook?.id ?? null,
    // While an event is live, new entries are tagged to it (can be removed).
    eventId: prefill.eventId ?? activeEvent?.id ?? null,
  });
  const [form, setForm] = useState<Form>(blank(defaultType));

  useEffect(() => {
    if (!open) return;
    setEditingRate(false);
    setForm(
      editing
        ? {
            type: editing.type,
            categoryId: editing.category.id,
            date: ymd(editing.date),
            note: editing.note ?? "",
            accountId: editing.account.id,
            bookId: editing.book.id,
            eventId: editing.event?.id ?? null,
            // Foreign entries reopen in their currency with the rate they were saved at.
            ...(editing.originalCurrency === "USD" &&
            editing.originalAmount !== null
              ? {
                  currency: "USD" as const,
                  amount: String(fromAmount(editing.originalAmount)),
                  fxRate: editing.fxRate ? String(editing.fxRate) : "",
                }
              : {
                  currency: "INR" as const,
                  amount: String(fromAmount(editing.amount)),
                  fxRate: "",
                }),
          }
        : blank(defaultType),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing, defaultType]);

  // Accounts may load after the sheet opens: fall back to the default account.
  useEffect(() => {
    if (open && form.accountId === null && defaultAccount)
      setForm((f) => ({ ...f, accountId: defaultAccount.id }));
  }, [open, form.accountId, defaultAccount]);

  useEffect(() => {
    if (open && form.bookId === null && defaultBook)
      setForm((f) => ({ ...f, bookId: scope.bookId ?? defaultBook.id }));
  }, [open, form.bookId, defaultBook, scope.bookId]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) =>
    setForm((f) => ({ ...f, [k]: v }));
  const cats = categories.filter((c) => c.type === form.type);
  const amount = toAmount(Number(form.amount));
  const isForeign = form.currency !== "INR";
  const fx = useFxRate(form.currency, form.date);
  const manualRate = Number(form.fxRate);
  const rate = isForeign ? (manualRate > 0 ? manualRate : fx.data?.rate) : 1;
  const inrAmount = rate ? Math.round(amount * rate) : null;
  const [editingRate, setEditingRate] = useState(false);
  const valid =
    amount > 0 &&
    form.categoryId !== null &&
    !!form.date &&
    (!isForeign || !!rate);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || form.categoryId === null) return;
    save.mutate(
      {
        id: editing?.id,
        type: form.type,
        amount,
        currency: form.currency,
        ...(isForeign && manualRate > 0 && { fxRate: manualRate }),
        categoryId: form.categoryId,
        date: form.date,
        ...(form.accountId && { accountId: form.accountId }),
        ...(form.bookId && { bookId: form.bookId }),
        eventId: form.eventId,
        note: form.note.trim() || null,
      },
      { onSuccess: close },
    );
  };

  const onDelete = async () => {
    if (!editing) return;
    const ok = await confirm({
      title: "Delete this transaction?",
      description: "You can undo right after deleting.",
      confirmText: "Delete",
      destructive: true,
    });
    if (ok) del.mutate(editing.id, { onSuccess: close });
  };

  const today = todayStr();
  const yesterday = format(subDays(new Date(), 1), "yyyy-MM-dd");
  const isCredit = form.type === "credit";

  // A split's "your share" row is managed by the split, so edit it there.
  if (editing?.splitId) {
    const splitId = editing.splitId;
    return (
      <ResponsiveSheet
        open={open}
        onOpenChange={(o) => !o && close()}
        title="Your share of a split"
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-xl bg-muted p-3">
            <CategoryIcon
              icon={editing.category.icon}
              color={editing.category.color}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{editing.note}</p>
              <p className="text-xs text-muted-foreground">
                {editing.category.name} · {shortDate(editing.date)}
              </p>
            </div>
            <span className="tabular font-semibold">
              {formatAmount(editing.amount)}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            Only your share of this shared bill counts as your expense. To
            change the amount, people or category, edit the split.
          </p>
          <Button
            size="lg"
            className="w-full"
            onClick={() => {
              close();
              openSplitEdit(splitId);
            }}
          >
            <Users /> Open split
          </Button>
        </div>
      </ResponsiveSheet>
    );
  }

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={(o) => !o && close()}
      title={editing ? "Edit transaction" : "Add transaction"}
    >
      <form onSubmit={submit} className="space-y-5">
        {editing && editing.type === "debit" && (
          <button
            type="button"
            onClick={() => {
              close();
              openSplitNew({
                fromTransaction: {
                  id: editing.id,
                  amount: editing.amount,
                  date: ymd(editing.date),
                  categoryId: editing.category.id,
                  note: editing.note,
                  categoryName: editing.category.name,
                  accountId: editing.account.id,
                  eventId: editing.event?.id ?? null,
                  bookId: editing.book.id,
                },
              });
            }}
            className="flex w-full items-center gap-3 rounded-xl border border-dashed border-primary/50 bg-accent/50 p-3 text-left text-sm"
          >
            <Users className="size-5 shrink-0 text-primary" />
            <span className="flex-1">
              <b>Split with friends</b>
              <span className="block text-xs text-muted-foreground">
                Paid for others too? Share this bill and track who owes you.
              </span>
            </span>
          </button>
        )}
        <Segmented
          className="w-full"
          value={form.type}
          onChange={(t) =>
            setForm((f) => ({ ...f, type: t, categoryId: null }))
          }
          options={[
            { value: "debit", label: "Expense (Debit)" },
            { value: "credit", label: "Income (Credit)" },
          ]}
        />

        <div className="space-y-2">
          <div
            className={cn(
              "flex items-center gap-2 rounded-2xl border-2 px-4 py-2 transition-colors focus-within:border-ring",
              isCredit ? "border-income/30" : "border-expense/30",
            )}
          >
            <span
              className={cn(
                "text-3xl font-bold",
                isCredit ? "text-income" : "text-expense",
              )}
            >
              {SYMBOL[form.currency]}
            </span>
            <input
              aria-label={`Amount in ${form.currency}`}
              inputMode="decimal"
              placeholder="0"
              autoFocus={!editing}
              className="tabular min-w-0 flex-1 bg-transparent py-1 text-4xl font-bold outline-none placeholder:text-muted-foreground/40"
              value={form.amount}
              onChange={(e) => {
                const v = e.target.value.replace(/[^\d.]/g, "");
                if (/^\d{0,10}(\.\d{0,2})?$/.test(v)) set("amount", v);
              }}
            />
            <div
              role="radiogroup"
              aria-label="Currency"
              className="flex shrink-0 rounded-lg bg-muted p-0.5 text-sm font-semibold"
            >
              {(["INR", "USD"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={form.currency === c}
                  onClick={() => {
                    setForm((f) => ({ ...f, currency: c, fxRate: "" }));
                    setEditingRate(false);
                  }}
                  className={cn(
                    "rounded-md px-2.5 py-1.5 text-muted-foreground transition-colors",
                    form.currency === c && "bg-card text-foreground shadow-sm",
                  )}
                >
                  {SYMBOL[c]} {c}
                </button>
              ))}
            </div>
          </div>

          {isForeign && (
            <div className="rounded-xl bg-muted/60 px-3 py-2.5 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <ArrowRightLeft className="size-4" /> Saved as
                </span>
                <span className="tabular text-base font-bold">
                  {inrAmount !== null && amount > 0
                    ? formatAmount(inrAmount)
                    : "₹—"}
                </span>
              </div>
              {editingRate ? (
                <div className="mt-2 flex items-center gap-2">
                  <span className="shrink-0 text-muted-foreground">
                    1 USD = ₹
                  </span>
                  <Input
                    aria-label="Exchange rate"
                    inputMode="decimal"
                    autoFocus
                    value={form.fxRate}
                    placeholder={fx.data ? String(fx.data.rate) : ""}
                    onChange={(e) =>
                      set("fxRate", e.target.value.replace(/[^\d.]/g, ""))
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      set("fxRate", "");
                      setEditingRate(false);
                    }}
                  >
                    Use market
                  </Button>
                </div>
              ) : (
                <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="tabular">
                    {fx.isLoading && !manualRate
                      ? "Fetching exchange rate…"
                      : fx.isError && !manualRate
                        ? "Couldn't fetch the rate, enter it manually"
                        : manualRate > 0
                          ? `1 USD = ₹${manualRate} (your rate)`
                          : fx.data
                            ? `1 USD = ₹${fx.data.rate.toFixed(2)} · ${
                                fx.data.source === "fallback"
                                  ? "offline estimate"
                                  : `rate of ${shortDate(fx.data.date)}`
                              }`
                            : ""}
                  </span>
                  <button
                    type="button"
                    className="flex shrink-0 items-center gap-1 font-medium text-primary"
                    onClick={() => setEditingRate(true)}
                  >
                    <Pencil className="size-3" /> Edit rate
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label>Category</Label>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
            {cats.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => set("categoryId", c.id)}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-xl border border-transparent p-2 text-center transition-all active:scale-95",
                  form.categoryId === c.id
                    ? "border-ring bg-accent"
                    : "hover:bg-muted",
                )}
              >
                <CategoryIcon icon={c.icon} color={c.color} size="sm" />
                <span className="line-clamp-2 text-[11px] leading-tight">
                  {c.name}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="txn-date">Date</Label>
          <div className="flex gap-2">
            {[
              { v: today, l: "Today" },
              { v: yesterday, l: "Yesterday" },
            ].map((d) => (
              <Button
                key={d.v}
                type="button"
                size="sm"
                variant={form.date === d.v ? "default" : "outline"}
                onClick={() => set("date", d.v)}
                className="h-11 md:h-9"
              >
                {d.l}
              </Button>
            ))}
            <DateInput
              id="txn-date"
              max="2100-12-31"
              value={form.date}
              onChange={(v) => set("date", v)}
              className="flex-1"
            />
          </div>
        </div>

        <AccountPicker
          label={isCredit ? "Received in" : "Paid via"}
          value={form.accountId}
          onChange={(id) => set("accountId", id)}
        />

        <BookPicker value={form.bookId} onChange={(id) => set("bookId", id)} />

        <EventPicker
          value={form.eventId}
          onChange={(id) => set("eventId", id)}
          date={form.date}
        />

        <div className="space-y-2">
          <Label htmlFor="txn-note">Note (optional)</Label>
          <Input
            id="txn-note"
            maxLength={500}
            placeholder={
              isCredit ? "e.g. September salary" : "e.g. Vegetables from market"
            }
            value={form.note}
            onChange={(e) => set("note", e.target.value)}
          />
        </div>

        <div className="flex gap-2 pt-1">
          {editing && (
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={onDelete}
              className="text-destructive"
              aria-label="Delete transaction"
            >
              <Trash2 />
            </Button>
          )}
          <Button
            type="submit"
            size="lg"
            className="flex-1"
            disabled={!valid || save.isPending}
          >
            {save.isPending
              ? "Saving…"
              : editing
                ? "Save changes"
                : `Add ${isCredit ? "income" : "expense"}`}
          </Button>
        </div>
      </form>
    </ResponsiveSheet>
  );
}
