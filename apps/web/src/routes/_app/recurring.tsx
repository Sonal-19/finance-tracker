import { createFileRoute } from "@tanstack/react-router";
import { Pause, Pencil, Play, Plus, Repeat, Trash2 } from "lucide-react";
import { useState } from "react";
import { AccountPicker, BookPicker } from "@/components/app/pickers";
import { CategoryIcon } from "@/components/common/category-icon";
import { CollapsibleGrid } from "@/components/common/collapsible-grid";
import { confirm } from "@/components/common/confirm-dialog";
import { DateInput } from "@/components/common/date-input";
import { Field } from "@/components/common/field";
import { PageHeader } from "@/components/common/page-header";
import { ResponsiveSheet } from "@/components/common/responsive-sheet";
import { Segmented } from "@/components/common/segmented";
import { EmptyState, PageLoader } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAccounts, useActiveAccounts } from "@/hooks/use-accounts";
import { useActiveBooks } from "@/hooks/use-books";
import {
  type RecurringInput,
  type RecurringRule,
  useCategories,
  useDeleteRecurring,
  useRecurring,
  useSaveRecurring,
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

export const Route = createFileRoute("/_app/recurring")({
  component: RecurringPage,
});

const FREQ_LABEL = {
  daily: "Every day",
  weekly: "Every week",
  monthly: "Every month",
  yearly: "Every year",
} as const;

function RecurringPage() {
  const { data, isLoading } = useRecurring();
  const { data: accounts } = useAccounts();
  const accountName = (id: number) =>
    accounts?.accounts.find((a) => a.id === id)?.name;
  const save = useSaveRecurring();
  const del = useDeleteRecurring();
  const [editing, setEditing] = useState<RecurringRule | "new" | null>(null);

  const monthlyOut = (data ?? [])
    .filter((r) => r.status === "active" && r.type === "debit")
    .reduce(
      (a, r) =>
        a +
        r.amount *
          { daily: 30, weekly: 4.33, monthly: 1, yearly: 1 / 12 }[r.frequency],
      0,
    );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Recurring"
        description="Rent, salary, EMIs and subscriptions are added automatically."
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus /> New rule
          </Button>
        }
      />
      {monthlyOut > 0 && (
        <div className="rounded-2xl border bg-card p-4 text-sm">
          Fixed monthly outgo:{" "}
          <b className="tabular text-expense">
            ≈ {formatAmount(Math.round(monthlyOut))}
          </b>
        </div>
      )}
      {isLoading ? (
        <PageLoader />
      ) : !data?.length ? (
        <EmptyState
          icon={<Repeat className="size-8" />}
          title="No recurring entries"
        >
          Add your rent, salary or subscriptions once and forget about them.
        </EmptyState>
      ) : (
        <div className="divide-y overflow-hidden rounded-2xl border bg-card">
          {data.map((r) => (
            <div
              key={r.id}
              className={cn(
                "flex flex-wrap items-center gap-x-3 gap-y-1 p-4",
                r.status !== "active" && "opacity-60",
              )}
            >
              <CategoryIcon icon={r.category.icon} color={r.category.color} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {r.note || r.category.name}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {FREQ_LABEL[r.frequency]} ·{" "}
                  {accountName(r.accountId) && `${accountName(r.accountId)} · `}
                  {r.status === "active"
                    ? `next ${shortDate(r.nextRunDate)}`
                    : r.status === "completed"
                      ? "ended"
                      : "paused"}
                  {r.endDate ? ` · until ${shortDate(r.endDate)}` : ""}
                </p>
              </div>
              <span
                className={cn(
                  "tabular shrink-0 font-semibold",
                  r.type === "credit" && "text-income",
                )}
              >
                {r.type === "credit" ? "+" : "−"}
                {formatAmount(r.amount)}
              </span>
              <div className="-mr-2 ml-auto flex shrink-0 basis-full justify-end sm:basis-auto">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={r.status === "active" ? "Pause" : "Resume"}
                  onClick={() =>
                    save.mutate({
                      id: r.id,
                      status: r.status === "active" ? "paused" : "active",
                    })
                  }
                >
                  {r.status === "active" ? <Pause /> : <Play />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Edit"
                  onClick={() => setEditing(r)}
                >
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Delete"
                  onClick={async () => {
                    if (
                      await confirm({
                        title: "Delete this rule?",
                        description:
                          "Transactions already added stay in your history.",
                        confirmText: "Delete",
                        destructive: true,
                      })
                    )
                      del.mutate(r.id);
                  }}
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
      <RecurringSheet value={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

type Form = Omit<RecurringInput, "amount" | "categoryId"> & {
  amount: string;
  categoryId: number | null;
};

function RecurringSheet({
  value,
  onClose,
}: {
  value: RecurringRule | "new" | null;
  onClose: () => void;
}) {
  const { data: categories = [] } = useCategories();
  const { defaultAccount } = useActiveAccounts();
  const { defaultBook } = useActiveBooks();
  const save = useSaveRecurring();
  const blank: Form = {
    type: "debit",
    amount: "",
    categoryId: null,
    note: "",
    frequency: "monthly",
    startDate: todayStr(),
    endDate: null,
  };
  const [form, setForm] = useState<Form>(blank);
  const [last, setLast] = useState(value);
  if (value !== last) {
    setLast(value);
    setForm(
      value && value !== "new"
        ? {
            type: value.type,
            amount: String(fromAmount(value.amount)),
            categoryId: value.categoryId,
            accountId: value.accountId,
            bookId: value.bookId,
            note: value.note ?? "",
            frequency: value.frequency,
            startDate: ymd(value.startDate),
            endDate: value.endDate ? ymd(value.endDate) : null,
          }
        : blank,
    );
  }
  const cats = categories.filter((c) => c.type === form.type);
  const valid = Number(form.amount) > 0 && form.categoryId !== null;

  return (
    <ResponsiveSheet
      open={!!value}
      onOpenChange={(o) => !o && onClose()}
      title={value === "new" ? "New recurring entry" : "Edit recurring entry"}
      description="Past dates from the start date are filled in automatically."
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid || form.categoryId === null) return;
          save.mutate(
            {
              id: value && value !== "new" ? value.id : undefined,
              ...form,
              amount: toAmount(Number(form.amount)),
              categoryId: form.categoryId,
              note: form.note?.trim() || null,
              endDate: form.endDate || null,
            },
            { onSuccess: onClose },
          );
        }}
      >
        <Segmented
          className="w-full"
          value={form.type}
          onChange={(type) => setForm({ ...form, type, categoryId: null })}
          options={[
            { value: "debit", label: "Expense" },
            { value: "credit", label: "Income" },
          ]}
        />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount (₹)" htmlFor="rec-amount">
            <Input
              id="rec-amount"
              inputMode="decimal"
              value={form.amount}
              onChange={(e) =>
                setForm({
                  ...form,
                  amount: e.target.value.replace(/[^\d.]/g, ""),
                })
              }
              placeholder="18000"
            />
          </Field>
          <Field label="Repeats" htmlFor="rec-freq">
            <select
              id="rec-freq"
              className="h-11 w-full rounded-md border border-input bg-transparent px-3 md:h-9"
              value={form.frequency}
              onChange={(e) =>
                setForm({
                  ...form,
                  frequency: e.target.value as Form["frequency"],
                })
              }
            >
              {Object.entries(FREQ_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="space-y-2">
          <Label>Category</Label>
          <CollapsibleGrid
            variant="tile"
            selectedIndex={cats.findIndex((c) => c.id === form.categoryId)}
            className="grid-cols-4 gap-2 sm:grid-cols-5"
          >
            {cats.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setForm({ ...form, categoryId: c.id })}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-xl border border-transparent p-2 text-center",
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
          </CollapsibleGrid>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start date" htmlFor="rec-start">
            <DateInput
              id="rec-start"
              value={form.startDate}
              onChange={(v) => setForm({ ...form, startDate: v })}
            />
          </Field>
          <Field label="End date (optional)" htmlFor="rec-end">
            <DateInput
              id="rec-end"
              min={form.startDate}
              value={form.endDate ?? ""}
              onChange={(v) => setForm({ ...form, endDate: v || null })}
            />
          </Field>
        </div>
        <AccountPicker
          label={form.type === "credit" ? "Received in" : "Paid via"}
          value={form.accountId ?? defaultAccount?.id ?? null}
          onChange={(id) => setForm({ ...form, accountId: id })}
        />
        <BookPicker
          value={form.bookId ?? defaultBook?.id ?? null}
          onChange={(id) => setForm({ ...form, bookId: id })}
        />
        <Field label="Label" htmlFor="rec-note">
          <Input
            id="rec-note"
            value={form.note ?? ""}
            maxLength={500}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            placeholder="e.g. Flat rent, Netflix"
          />
        </Field>
        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={!valid || save.isPending}
        >
          Save
        </Button>
      </form>
    </ResponsiveSheet>
  );
}
